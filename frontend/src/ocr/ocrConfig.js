// Tesseract settings shared by the app and the eval script.
export const TESS_PARAMS = {
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
  tessedit_pageseg_mode: '6', // a block of text: handles 1-row and 2-row plates
  preserve_interword_spaces: '0',
};
