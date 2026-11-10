/**
 * Passwords of 10+ characters that appear near the top of public breach
 * frequency lists, plus campus-specific guesses. Compared case-insensitively.
 * This is a small first line of defence; length (≥ 10) does most of the work.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '1234567890', '0987654321', '12345678910', '123456789a', 'a123456789', '1234567890a',
  '1111111111', '0000000000', '1212121212', '1234512345', '1122334455', '9876543210',
  'qwertyuiop', 'qwerty1234', 'qwerty12345', '1q2w3e4r5t', '1qaz2wsx3edc', 'zaq12wsxcde3',
  'asdfghjkl1', 'zxcvbnm123', 'qazwsxedcrfv', 'password12', 'password123', 'password1234',
  'password@123', 'password!1', 'passw0rd123', 'p@ssword123', 'p@ssw0rd123', 'iloveyou12',
  'iloveyou123', 'football123', 'baseball123', 'princess123', 'sunshine123', 'superman123',
  'starwars123', 'computer123', 'whatever123', 'trustno1234', 'letmein1234', 'welcome123',
  'welcome@123', 'admin12345', 'administrator', 'changeme123', 'abcdefghij', 'abcd123456',
  'abc1234567', 'aaaaaaaaaa', 'abcabcabca', 'india12345', 'india@123', 'chennai123',
  'chennai@123', 'vitchennai', 'vitchennai123', 'vit12345678', 'vitstudent', 'vitstudent123',
  'vellore123', 'vnav123456', 'vnavpassword', 'student123', 'student@123', 'college123',
  'qwerty@123', 'test123456', 'testing123', 'mypassword', 'mypassword1', 'secret1234',
]);
