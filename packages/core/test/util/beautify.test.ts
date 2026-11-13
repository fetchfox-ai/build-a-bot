import { expect, it } from 'vitest';
import { beautifyHtml } from '../../src/util/beautify.js';

it('indents elements and preserves inline content', () => {
  expect(beautifyHtml('<main><h1>Hello <em>world</em>!</h1><div><img src="x"><br></div></main>')).toBe(
    '<main>\n  <h1>Hello <em>world</em>!</h1>\n  <div>\n    <img src="x">\n    <br>\n  </div>\n</main>'
  );
});

it('preserves comments, doctypes, and whitespace-sensitive content', () => {
  const html = '<!doctype html><!-- note --><div><pre>  one\n    two  </pre><script>if (a < b) {\n  run();\n}</script></div>';
  expect(beautifyHtml(html)).toBe(
    '<!doctype html>\n<!-- note -->\n<div>\n  <pre>  one\n    two  </pre>\n  <script>if (a < b) {\n  run();\n}</script>\n</div>'
  );
});
