import { UnixFS } from 'ipfs-unixfs'
import { fileTypeFromBuffer } from 'file-type'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagPb from '@ipld/dag-pb'
import * as dagJson from '@ipld/dag-json'
import * as raw from 'multiformats/codecs/raw'
import * as json from 'multiformats/codecs/json'

class BlockIndexEntry {
  constructor (type, data, links) {
    this.type = type
    this.data = data
    this.links = links
  }

  hasLinks () {
    return this.links.length > 0
  }

  isDirectory() {
    return this.type === "directory"
  }
}

class BlockIndex {
  constructor() {
    this.blockMap = {}
    this.size = 0
  }

  addBlock(cid, entry) {
    this.blockMap[cid] = entry
    this.size++
  }

  getBlock(cid) {
    return this.blockMap[cid]
  }
}

class Block {
  constructor(cid, bytes) {
    const decoded = this.decode(cid, bytes)

    this.dagDBRepresentation = decoded
    this.unixFSRepresentation = UnixFS.unmarshal(bytes)
  }

  getType() {
    return this.unixFSRepresentation.type
  }

  isFile() {
    return this.getType() === "file"
  }

  getData() {
    return this.unixFSRepresentation.data
  }

  hasLinks() {
    return this.dagDBRepresentation.Links.length > 0
  }

  getLinks() {
    return this.dagDBRepresentation.Links.map(link => link.Hash)
  }

  decode (cid, bytes) {
    const codecs = {
      [dagCbor.code]: dagCbor,
      [dagPb.code]: dagPb,
      [dagJson.code]: dagJson,
      [raw.code]: raw,
      [json.code]: json
    }

    if (!codecs[cid.code]) {
      throw new Error(`Unknown codec code: 0x${cid.code.toString(16)}`)
    }

    return codecs[cid.code].decode(bytes)
  }
}

export class CARMimeTypeRetriever {

  constructor() {
    this.blockIndex = new BlockIndex()
  }

  addBlock(cid, bytes) {
    const block = new Block(cid, bytes)

    let blockIndexEntry
    if (block.isFile() && !block.hasLinks()) {
      blockIndexEntry = new BlockIndexEntry(block.getType(), block.getData().subarray(0, 350), [])
    } else {
      blockIndexEntry = new BlockIndexEntry(block.getType(), null, block.getLinks())
    }

    this.blockIndex.addBlock(cid, blockIndexEntry)
  }

  async retrieveTypeForFile(cid) {
    let currentBlock = cid;

    let i = 0;
    while(i < this.blockIndex.size) {
      const blockIndexEntry = this.blockIndex.getBlock(currentBlock)

      if (!blockIndexEntry.hasLinks()) {
        const result = await fileTypeFromBuffer(blockIndexEntry.data)
        if (result === undefined) {
          throw Error("Mime type could be determined")
        }

        return result.mime
      }

      currentBlock = blockIndexEntry.links[0]
      i += 1
    }

    throw Error("Mime type could not be determined")
  }

  async retrieveTypeForDirectory(links) {
    const mimeTypes = []

    for (const link of links) {
      const result = await this.retrieveTypeForFile(link)
      mimeTypes.push(result || undefined)
    }

    return mimeTypes
  }

  async retrieveType(cid) {
    try {
      const rootBlockIndexEntry = this.blockIndex.getBlock(cid)
      if (rootBlockIndexEntry.isDirectory()) {
        return await this.retrieveTypeForDirectory(rootBlockIndexEntry.links)
      }

      return [await this.retrieveTypeForFile(cid)]
    } catch (error) {
      return []
    }
  }
}