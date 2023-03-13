import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getResponseFormat } from '#src/utils/http.js'

describe('http utils', () => {
    const createReqWithAccept = (accept) => ({
        query: {},
        headers: { accept }
    })

    it('parses Accept header', () => {
        let format = getResponseFormat(createReqWithAccept('application/vnd.ipld.car'))
        assert.strictEqual(format, 'car')

        format = getResponseFormat(createReqWithAccept('application/vnd.ipld.car;version=1'))
        assert.strictEqual(format, 'car')

        format = getResponseFormat(createReqWithAccept('application/vnd.ipld.car; version=1'))
        assert.strictEqual(format, 'car')

        format = getResponseFormat(createReqWithAccept('application/vnd.ipld.raw'))
        assert.strictEqual(format, 'raw')

        format = getResponseFormat(createReqWithAccept('text/plain, application/vnd.ipld.raw'))
        assert.strictEqual(format, 'raw')

        format = getResponseFormat(createReqWithAccept())
        assert.strictEqual(format, null)
    })
})
