// Corrige bug de "File is not defined" no Undici (axios / Node 18–20)
if (typeof global.File === 'undefined') {
  global.File = class File {
    constructor(parts, filename, opts = {}) {
      this.parts = parts;
      this.name = filename;
      this.lastModified = opts.lastModified || Date.now();
      this.type = opts.type || '';
    }
  };
}
