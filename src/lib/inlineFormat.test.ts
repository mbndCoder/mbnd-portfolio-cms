import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectActiveFormats,
  exitInlineFormat,
  insertInlineLink,
  toggleInlineFormat,
} from './inlineFormat.ts';

test('toggleInlineFormat wraps selected text and places cursor AFTER closing markers (no lock)', () => {
  const res = toggleInlineFormat('سلام دنیا خوب', 5, 9, 'bold', 'fa');
  assert.equal(res.value, 'سلام **دنیا** خوب');
  assert.equal(res.action, 'wrapped');
  // Cursor is placed immediately after closing ** so typing continues unformatted
  assert.equal(res.selectionStart, 13);
  assert.equal(res.selectionEnd, 13);
});

test('toggleInlineFormat unwraps selected text when already formatted (both inner and outer selection)', () => {
  const inner = toggleInlineFormat('سلام **دنیا** خوب', 7, 11, 'bold', 'fa');
  assert.equal(inner.value, 'سلام دنیا خوب');
  assert.equal(inner.action, 'unwrapped');
  assert.equal(inner.value.slice(inner.selectionStart, inner.selectionEnd), 'دنیا');

  const outer = toggleInlineFormat('سلام **دنیا** خوب', 5, 13, 'bold', 'fa');
  assert.equal(outer.value, 'سلام دنیا خوب');
  assert.equal(outer.action, 'unwrapped');
});

test('toggleInlineFormat exits cleanly when collapsed cursor is inside a formatted span', () => {
  // Cursor right after "world" before closing "**"
  const text = 'Hello **world**';
  const cursorInside = 13; // right before **
  const active = detectActiveFormats(text, cursorInside, cursorInside);
  assert.equal(active.bold, true);
  assert.equal(active.italic, false);

  const res = toggleInlineFormat(text, cursorInside, cursorInside, 'bold', 'en');
  assert.equal(res.action, 'exited');
  assert.equal(res.value, text);
  assert.equal(res.selectionStart, text.length);
  assert.equal(res.selectionEnd, text.length);
  assert.equal(detectActiveFormats(res.value, res.selectionStart, res.selectionEnd).bold, false);
});

test('toggleInlineFormat inserts localized placeholder in English vs Persian when collapsed outside span', () => {
  const faRes = toggleInlineFormat('متن ', 4, 4, 'highlight', 'fa');
  assert.equal(faRes.value, 'متن ==نکته مهم==');
  assert.equal(faRes.action, 'inserted');
  assert.equal(faRes.value.slice(faRes.selectionStart, faRes.selectionEnd), 'نکته مهم');

  const enRes = toggleInlineFormat('Text ', 5, 5, 'highlight', 'en');
  assert.equal(enRes.value, 'Text ==highlighted text==');
  assert.equal(enRes.action, 'inserted');
  assert.equal(enRes.value.slice(enRes.selectionStart, enRes.selectionEnd), 'highlighted text');
});

test('toggleInlineFormat splits partially selected text inside an existing span instead of double-wrapping', () => {
  const res = toggleInlineFormat('**one two three**', 6, 9, 'bold', 'en');
  assert.equal(res.value, '**one **two** three**');
  assert.equal(res.action, 'unwrapped');
});

test('detectActiveFormats distinguishes italic from bold cleanly', () => {
  assert.deepEqual(detectActiveFormats('**bold**', 3, 3), {
    bold: true,
    italic: false,
    highlight: false,
    code: false,
    any: true,
  });
  assert.deepEqual(detectActiveFormats('*italic*', 3, 3), {
    bold: false,
    italic: true,
    highlight: false,
    code: false,
    any: true,
  });
  assert.deepEqual(detectActiveFormats('`npm run dev`', 4, 4), {
    bold: false,
    italic: false,
    highlight: false,
    code: true,
    any: true,
  });
});

test('exitInlineFormat jumps cursor past closing delimiter for Escape key', () => {
  const text = 'Visit [mbnd](https://mbnd.ir) now';
  const res = exitInlineFormat(text, 10);
  assert.equal(res.exited, true);
  assert.equal(res.cursor, 29);

  const boldRes = exitInlineFormat('==important==', 7);
  assert.equal(boldRes.exited, true);
  assert.equal(boldRes.cursor, 13);
});

test('insertInlineLink places cursor immediately after closing parenthesis', () => {
  const res = insertInlineLink('Check ', 6, 6, 'my site', 'https://mbnd.ir');
  assert.equal(res.value, 'Check [my site](https://mbnd.ir)');
  assert.equal(res.cursor, res.value.length);
});
