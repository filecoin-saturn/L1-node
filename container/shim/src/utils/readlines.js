import { open, stat } from "node:fs/promises";

function offsetFilename(filename) {
  return `${filename}.offsetfile`;
}

async function getFileContents(filename) {
  const file = await open(filename, "r");

  try {
    return await file.readFile(); // await to ensure finally is called after file is read
  } finally {
    await file.close();
  }
}

async function getResumableOffset(filename) {
  try {
    // get current file stat and read the offsetfile contents
    const [currentStat, offsetfile] = await Promise.all([stat(filename), getFileContents(offsetFilename(filename))]);

    // file is empty, reset the offset
    if (offsetfile === "") {
      return setResumableOffset(filename, 0, currentStat);
    }

    // offsetfile contains stringified JSON object with { offset [int], ino [int], size [int] }
    const resumable = JSON.parse(offsetfile);

    // if the file has been rotated, truncated or offset is corrupted, reset the offsetfile
    const isFileRotated = resumable.ino !== currentStat.ino; // https://en.wikipedia.org/wiki/Inode
    const isFileTruncated = resumable.size > currentStat.size || resumable.offset > currentStat.size;
    const isOffsetCorrupted = isNaN(resumable.offset);

    if (isFileRotated || isFileTruncated || isOffsetCorrupted) {
      return setResumableOffset(filename, 0, currentStat);
    }

    return resumable.offset;
  } catch (error) {
    // file does not exist, create it
    if (error.code === "ENOENT") {
      return setResumableOffset(filename, 0);
    }

    // re-throw error if it's not ENOENT
    throw error;
  }
}

async function setResumableOffset(filename, offset, currentStat) {
  const { ino, size } = currentStat ?? (await stat(filename));
  const offsetfile = await open(offsetFilename(filename), "w");

  try {
    // store inode and file size alongside offset to detect file rotation
    await offsetfile.writeFile(JSON.stringify({ ino, size, offset }));
  } finally {
    await offsetfile.close();
  }

  return offset;
}

/**
 * Read lines from a file and return them as an array.
 * This function will resume reading from the last offset if no offset is provided.
 * The returned promise will resolve when the readSize is reached or the end of the file is reached.
 * The returned promise will reject if the file cannot be opened or read.
 * The returned promise will resolve with an object containing:
 * - lines: an array of lines read from the file
 * - offset: the byte offset of the last line read
 * - eof: true if the end of the file was reached
 * - confirmed: a function that confirms that the lines were processed and the offset can be updated
 *
 * @param {string} filename - file name to read from
 * @param {number} offsetBytes - byte offset to start reading from (default: resume from last offset)
 * @param {number} readSize - max number of bytes to read at a time (default 10MB)
 * @returns {Promise<{lines: string[], offset: number, eof: boolean, confirmed: () => Promise<void>}>
 */
export default async function readlines(filename, offsetBytes = null, readSize = 10 * 1024 * 1024) {
  // if no offset is provided, get the last offset from the offsetfile
  if (offsetBytes === null) offsetBytes = await getResumableOffset(filename);

  // open the file for reacding and create a read stream starting at the given offset
  const file = await open(filename, "r");
  const stream = file.createReadStream({ encoding: "utf8", start: offsetBytes });

  // setting read size to less than the stream's readableHighWaterMark will cause the stream to end
  // after every chunk read (chunk size set in readableHighWaterMark) which will be highly inefficient
  // so we throw an error if the readSize is less than the readableHighWaterMark
  if (readSize < stream.readableHighWaterMark) {
    throw new Error(`readSize must be greater than readableHighWaterMark (${stream.readableHighWaterMark} bytes)`);
  }

  return new Promise((resolve, reject) => {
    const lines = [];
    let adjustBytes = 0;

    // This event is emitted for every chunk read (chunk size set in readableHighWaterMark)
    // until the stream is closed once we reach end of file or readSize (whichever comes first).
    stream.on("data", (chunk) => {
      // split data chunk into lines
      const items = chunk.split("\n");

      // iterate over lines in this chunk and add them to the lines array
      for (let i = 0; i < items.length; i++) {
        // If the first item is not a new line and there was already at least one line read, append it
        // to the last line because it means the last line was not finished and was split across chunks.
        // Otherwise, push the item to the lines array.
        if (lines.length > 0 && i === 0) {
          lines[lines.length - 1] += items[i];
        } else {
          lines.push(items[i]);
        }
      }

      // after the last line of this chunk is added, check if we have reached the readSize limit
      if (readSize < stream.bytesRead) {
        // if the last item is not a new line (results in empty string), it means the last line
        // was not finished and was split across chunks so we need to adjust the offset to not
        // include the last line and pop it from the lines array
        if (items[items.length - 1] !== "") {
          adjustBytes = new Blob([items[items.length - 1]]).size;
          lines.pop(); // pop unfinished item
        }

        // close the stream to stop reading (this will emit the "end" event and close the file)
        stream.close();
        stream.push(null);
        stream.read(0);
      }
    });

    stream.on("end", async () => {
      // calculate the offset of the last line read
      const offset = offsetBytes + stream.bytesRead - adjustBytes;

      // if stream was not closed because we reached readSize which means we reached the end of the file
      const eof = stream.bytesRead <= readSize;

      // resolve the promise with the lines read and a function to confirm the offset
      resolve({ lines, offset, eof, confirmed: () => setResumableOffset(filename, offset) });
    });

    // reject the promise if there was an error reading the file
    stream.on("error", (error) => {
      reject(error);
    });
  });
}
