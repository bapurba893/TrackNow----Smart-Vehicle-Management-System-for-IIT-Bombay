// Indian registration plate, e.g. MH01AB1234 or MH12A1234 (no spaces).
const PLATE_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/;

const isValidPlate = (plate) => typeof plate === 'string' && PLATE_REGEX.test(plate);

module.exports = { PLATE_REGEX, isValidPlate };
