import { describe, expect, it } from 'vitest';
import { csv, csvCell, rupees } from './csv.js';

describe('CSV exports (D-066)', () => {
  it('quotes cells that need it and neutralises formulas', () => {
    expect(csvCell('Asha Rai')).toBe('Asha Rai');
    expect(csvCell('Rai, Asha')).toBe('"Rai, Asha"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+977 98')).toBe("'+977 98");
    expect(csvCell('@cmd')).toBe("'@cmd");
    // Numbers stay numbers (a negative amount is not a formula).
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('true');
    expect(csvCell('तयारी कक्षा')).toBe('तयारी कक्षा');
  });

  it('writes a BOM, the header and CRLF rows', () => {
    expect(
      csv(
        ['a', 'b'],
        [
          [1, 'x'],
          [null, 'y,z'],
        ],
      ),
    ).toBe('\uFEFFa,b\r\n1,x\r\n,"y,z"\r\n');
    expect(rupees(300_000)).toBe('3000.00');
    expect(rupees(5)).toBe('0.05');
    expect(rupees(null)).toBe('');
  });
});
