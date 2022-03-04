import toIterable from 'browser-readablestream-to-it'

export function asAsyncIterable(readable) {
  return Symbol.asyncIterator in readable ? readable : toIterable(readable)
}