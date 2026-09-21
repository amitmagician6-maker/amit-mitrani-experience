import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/invitation-photo.js", import.meta.url), "utf8");
const data = (type, size) => `data:${type};base64,${"A".repeat(size)}`;
function setup({ width = 3840, height = 3072, input = data("image/png", 900000), webp = true, encodeSize = () => 200000, broken = false } = {}) {
  const encodes = [], draws = [], fills = [];
  let canvas;
  const context = vm.createContext({
    FileReader: class {
      readAsDataURL() { this.result = input; queueMicrotask(() => this.onload()); }
    },
    Image: class {
      naturalWidth = width;
      naturalHeight = height;
      set src(value) { queueMicrotask(() => broken ? this.onerror() : this.onload()); }
    },
    document: { createElement() {
      canvas = {
        width: 0, height: 0,
        getContext() { return {
          drawImage(image, x, y, w, h) { draws.push({ image, w, h }); },
          fillRect() { fills.push(true); }
        }; },
        toDataURL(requestedType, quality) {
          const type = !webp && requestedType === "image/webp" ? "image/png" : requestedType;
          const call = { type, quality, width: this.width, height: this.height };
          encodes.push(call);
          return data(type, encodeSize(call));
        }
      };
      return canvas;
    } }
  });
  vm.runInContext(source.replaceAll("export ", "") + "\nthis.compress = compressPhoto;", context);
  return { compress: context.compress, encodes, draws, fills, canvas: () => canvas };
}
const file = { type: "image/png", size: 700000 };

const original = data("image/png", 100000);
let test = setup({ input: original });
assert.equal(await test.compress(file), original, "Small originals must remain byte-for-byte intact");
assert.equal(test.encodes.length, 0);

test = setup({ webp: false, encodeSize: ({ type }) => type === "image/png" ? 900000 : 250000 });
assert.match(await test.compress(file), /^data:image\/jpeg;base64,/);
assert.deepEqual(test.encodes.map(x => x.width), [2560, 2560], "Unsupported WebP must fall back to JPEG without shrinking");
assert.equal(test.encodes[1].height, 2048);
assert.ok(test.fills.length, "JPEG fallback must composite transparency on white");

test = setup({ encodeSize: ({ quality }) => quality > .90 ? 500000 : 200000 });
await test.compress(file);
assert.deepEqual(test.encodes.map(x => x.width), [2560, 2560], "Try high-quality encoding before lowering resolution");

test = setup({ width: 600, height: 900 });
await test.compress(file);
assert.equal(test.encodes[0].width, 600);
assert.equal(test.encodes[0].height, 900, "Never upscale a low-resolution source");

test = setup({ webp: false, encodeSize: ({ type, width, quality }) => type !== "image/png" && width <= 1600 && quality <= .78 ? 350000 : 900000 });
assert.match(await test.compress(file), /^data:image\/jpeg;base64,/);
assert.equal(test.encodes.at(-1).width, 1600, "Detailed invitations must upload by tuning quality without a tiny thumbnail");
assert.equal(test.encodes.at(-1).quality, .78);
assert.ok(test.draws.every(x => x.image === test.draws[0].image), "Every resize must use the original decoded image");

test = setup({ webp: false, encodeSize: ({ type, width, quality }) => type !== "image/png" && width <= 900 && quality <= .66 ? 390000 : 900000 });
assert.match(await test.compress(file), /^data:image\/jpeg;base64,/, "Very noisy images must also fit instead of being rejected");
assert.equal(test.encodes.at(-1).width, 900);

test = setup({ encodeSize: () => 900000 });
await assert.rejects(test.compress(file), /photo-encode/);
assert.ok(test.encodes.every(x => x.width >= 768 && x.quality >= .62), "Do not return to the old 360px PNG shrinking loop");
assert.equal(test.canvas().width, 1, "Release the canvas after failure");
assert.ok(test.draws.every(x => x.image === test.draws[0].image), "Every resize must use the original decoded image");

test = setup();
assert.equal(await test.compress(null), "");
await assert.rejects(test.compress({ ...file, size: 21 * 1024 * 1024 }), /photo-size/);
await assert.rejects(test.compress({ ...file, type: "image/svg+xml" }), /photo-type/);
await assert.rejects(setup({ broken: true }).compress(file), /photo-decode/);
console.log("Invitation photo regression checks passed (original preservation, PNG fallback, detailed and noisy images, resolution, failures).");
