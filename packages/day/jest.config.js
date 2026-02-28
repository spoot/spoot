/** @type {import("jest").Config} */
export default {
  clearMocks: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  transform: { "^.+\\.tsx?$": "ts-jest" },
};
