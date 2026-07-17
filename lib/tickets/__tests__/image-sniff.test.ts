import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffImage } from '../image-sniff'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 ')])

test('detects jpeg', () => assert.deepEqual(sniffImage(jpeg), { mime: 'image/jpeg', ext: 'jpg' }))
test('detects png', () => assert.deepEqual(sniffImage(png), { mime: 'image/png', ext: 'png' }))
test('detects webp', () => assert.deepEqual(sniffImage(webp), { mime: 'image/webp', ext: 'webp' }))
test('rejects gif', () => assert.equal(sniffImage(Buffer.from('GIF89a....')), null))
test('rejects pdf', () => assert.equal(sniffImage(Buffer.from('%PDF-1.4')), null))
test('rejects riff-but-not-webp (wav)', () =>
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])), null))
test('rejects tiny buffer', () => assert.equal(sniffImage(Buffer.from([0xff])), null))
