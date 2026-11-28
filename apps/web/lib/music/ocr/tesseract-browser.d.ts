// The browser build of Tesseract.js (UMD, so CommonJS for the bundler, as the
// package says with "type": "commonjs"). It has the API of the package, in
// one file, so the bundler needs none of its Node.js code.
declare module "tesseract.js/dist/tesseract.min.js" {
  import Tesseract from "tesseract.js";
  export default Tesseract;
}
