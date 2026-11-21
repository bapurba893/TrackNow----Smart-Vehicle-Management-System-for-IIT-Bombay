import { extractPlate } from './plateParser';

// Each case: what OCR returned → what the guard should see.
const cases = [
  ['clean single line', 'MH01AB1234', 'MH01AB1234'],
  ['spaces and dashes', 'MH 01-AB 1234', 'MH01AB1234'],
  ['lowercase', 'mh02cd5678', 'MH02CD5678'],
  ['O read for 0 in district', 'MHO1AB1234', 'MH01AB1234'],
  ['0 read for O in series', 'KA05M01234', 'KA05MO1234'],
  ['Delhi 1-digit district format (not supported yet)', 'DL3CAB1234', null],
  ['I/1 and S/5 swaps', 'MH12AB I2S4', 'MH12AB1254'],
  ['B read as 8 in series', 'MH048X7777', 'MH04BX7777'],
  ['8 read as B in number', 'MH04BX7B77', 'MH04BX7877'],
  ['single-letter series', 'KA05M9876', 'KA05M9876'],
  ['HSRP with IND text', 'IND MH 47 AS 0912', 'MH47AS0912'],
  ['two-row plate', 'MH 01\nAB 1234', 'MH01AB1234'],
  ['noise around plate', '|| ~MH01AB1234. ]', 'MH01AB1234'],
  ['N misread for M in state code', 'NH01AB1234', 'MH01AB1234'],
  ['garbage', 'hello world', null],
  ['empty', '', null],
];

describe('extractPlate', () => {
  test.each(cases)('%s', (_name, raw, expected) => {
    const r = extractPlate(raw);
    expect(r ? r.plate : null).toBe(expected);
  });

  test('confidence reflects how many characters had to be corrected', () => {
    expect(extractPlate('MH01AB1234').confidence).toBe('high');
    expect(extractPlate('MHO1AB1234').confidence).toBe('medium');
  });
});
