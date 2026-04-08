const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const validatePasswordStrength = (password) => {
  const value = String(password || '');

  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }

  if (!PASSWORD_REGEX.test(value)) {
    return 'Password must include uppercase, lowercase, number, and special character';
  }

  return null;
};

module.exports = {
  PASSWORD_MIN_LENGTH,
  validatePasswordStrength,
};
