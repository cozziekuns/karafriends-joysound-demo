// Vertex Shader Program
const vsSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  
  uniform vec2 u_resolution;
  
  varying vec2 v_texCoord;

  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;

    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
  }
`;

// Fragment Shader Program
const fsSource = `
  precision mediump float;

  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  void main() {
    vec4 textureColor = texture2D(u_image, v_texCoord);

    if (textureColor.r == 1.0) {
      gl_FragColor = vec4(textureColor.r, textureColor.g, textureColor.b, 0.0);
    } else {
      gl_FragColor = vec4(1.0 - textureColor.r, 1.0 - textureColor.g, 1.0 - textureColor.b, textureColor.a);
    }
  }
`;

const SUTEGANA = [
  "ぁ","ぃ","ぅ","ぇ","ぉ","ゃ","ゅ","ょ","ゎ","ゕ","ゖ",
  "ァ","ィ","ゥ","ェ","ォ","ヵ","ㇰ","ヶ","ㇱ","ㇲ","ㇳ","ㇴ","ㇵ","ㇶ","ㇷ","ㇷ゚","ㇸ","ㇹ","ㇺ","ャ","ュ",,"ョ","ㇻ","ㇼ","ㇽ","ㇾ","ㇿ","ヮ"
];

const SOKUON_KANA = ["っ", "ッ"];

const BITMAP_FONT_FILENAME = "./0425691.bitmap";
const JOY_U2_FILENAME = "./0425691.joy_u2";
const ROMAJI_FONT_FILENAME = "romaji-font.png";

function parseLyricsBlockFurigana(view, offset) {
  const furigana = [];
  const furiganaCount = view.getUint16(offset);

  let currOffset = offset + 2;

  for (let i = 0; i < furiganaCount; i++) {
    const glyphs = [];

    const glyphCount = view.getUint16(currOffset);
    const xPos = view.getUint16(currOffset + 2);
   
    currOffset += 4;
    
    for (let j = 0; j < glyphCount; j++) {
      const glyph = view.getUint16(currOffset);
      glyphs.push(glyph);

      currOffset += 2;  
    } 

    furigana.push({ xPos, glyphs });
  }

  return furigana;
}

function parseLyricsBlock(view, offset) {
  const blockSize = view.getUint16(offset);
  
  const xPos = view.getUint16(offset + 4);
  const yPos = view.getUint16(offset + 6);
 
  const glyphs = [];
  
  const glyphCount = view.getUint16(offset + 16); 
  let glyphOffset = offset + 18;

  for (let i = 0; i < glyphCount; i++) {
    const glyph = view.getUint16(glyphOffset + 1);
    glyphs.push(glyph);
  
    glyphOffset += 3;
  }

  const furiganaOffset = glyphOffset;
  const furigana = parseLyricsBlockFurigana(view, furiganaOffset);

  return {
    blockSize,
    xPos,
    yPos,
    glyphs,
    glyphsRomaji: null,
    furiganaRomaji: null,
    furigana,
  };
}


function parseJoyU2Data(data, font) {
  const lyricsBlocks = [];

  const view = new DataView(data, 6, 4 * 8);
  
  const lyricsOffset = view.getUint32(4 + font * 8);
  const timingOffset = view.getUint32(8 + font * 8);

  const lyricsView = new DataView(data, lyricsOffset, timingOffset - lyricsOffset);
  let currOffset = 30; // Ignore colours for now

  while (currOffset < timingOffset - lyricsOffset) {
    const block = parseLyricsBlock(lyricsView, currOffset);
    lyricsBlocks.push(block);

    currOffset += block.blockSize;
  }

  return lyricsBlocks;
}

function parseBitmapFontHeader(data) {
  const headers = [];
  const view = new DataView(data, 0, 6 * 4);
  
  for (let i = 0; i < 3; i++) {
    const header = {
      offset: view.getUint32(i * 4),
      length: view.getUint32((i + 3) * 4),
    };

    headers.push(header);
  }

  return headers;
}

function parseBitmapFontSectionHeader(view) {
  const headerSize = view.getUint32(12);
  const ptrTableSize = view.getUint32(8); 
  const sectionSize = view.getUint32(16);
  
  const glyphOffsets = [];
  const numGlyphs = ptrTableSize / 4;

  for (let i = 0; i < numGlyphs; i++) {
    glyphOffsets.push(view.getUint32(i * 4 + 20));
  }

  return {
    headerSize,
    ptrTableSize,
    sectionSize, 
    glyphOffsets,  
  };
}

function parseBitmapFontSection(data, offset, length) {
  const bitmapFont = {
    glyphs: [],
  };

  const view = new DataView(data, offset, length);  
  const sechdr = parseBitmapFontSectionHeader(view);
  
  for (let i = 0; i < sechdr.glyphOffsets.length; i++) {
    const glyphOffset = sechdr.glyphOffsets[i];

    const glyphCode = view.getUint16(glyphOffset + 8);
    const advance = view.getUint8(glyphOffset + 10);
    const size = view.getUint8(glyphOffset + 11);
    const width = view.getUint8(glyphOffset + 12);
    const height = view.getUint8(glyphOffset + 13);
    const stride = view.getUint16(glyphOffset + 14);

    const bitmapLength = view.getUint16(glyphOffset + 22, true);
    const bitmapData = new Uint8Array(data, offset + glyphOffset + 24, bitmapLength);

    bitmapFont.glyphs.push({
      code: glyphCode,
      advance,
      size,
      width,
      height,
      stride,
      data: bitmapData,
    });
  }

  return bitmapFont;
};

function parseBitmapFontData(data) {
  const bitmapFonts = [];
  const bitmapFontHeader = parseBitmapFontHeader(data); 

  for (let i = 0; i < 3; i++) {
    const bitmapFont = parseBitmapFontSection(
      data, 
      bitmapFontHeader[i].offset,
      bitmapFontHeader[i].length,
    );

    bitmapFonts.push(bitmapFont);
  }

  return bitmapFonts;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  return program;
}

function drawRomajiBlock(gl, texCoordBuffer, positionBuffer, romajiFontImage, romaji, x, y) {
  for (let j = 0; j < romaji.length; j++) {
    const romajiGlyphIndex = romaji.charCodeAt(j) - 'a'.charCodeAt(0) + 33;

    drawRomajiGlyph(gl, texCoordBuffer, positionBuffer, romajiFontImage, romajiGlyphIndex, x + j * 16, y - 36);
  }
}

function drawLyricsBlock(gl, texCoordBuffer, positionBuffer, bitmapFont, romajiFontImage, lyricsBlock) {
  let xOff = 0;  
  let maxHeight = 0;

  for (let i = 0; i < lyricsBlock.glyphs.length; i++) {
    const glyphIndex = lyricsBlock.glyphs[i];
    
    if (maxHeight < bitmapFont.glyphs[glyphIndex].height) {
      maxHeight = bitmapFont.glyphs[glyphIndex].height;
    }
  }

  for (let i = 0; i < lyricsBlock.glyphs.length; i++) {
    const glyphIndex = lyricsBlock.glyphs[i];
    const romaji = lyricsBlock.glyphsRomaji[i];
    const yOff = maxHeight - bitmapFont.glyphs[glyphIndex].height;
    
    drawGlyph(
      gl, texCoordBuffer, positionBuffer, 
      bitmapFont, glyphIndex, 
      lyricsBlock.xPos + xOff, lyricsBlock.yPos + yOff,
    );
  
    if (romaji) {
      const romajiWidth = romaji.length * 16;
      const romajiXOff = Math.floor((bitmapFont.glyphs[glyphIndex].width - romajiWidth) / 2);

      drawRomajiBlock(gl, texCoordBuffer, positionBuffer, romajiFontImage, romaji, lyricsBlock.xPos + xOff + romajiXOff, lyricsBlock.yPos);
    }

    xOff += bitmapFont.glyphs[glyphIndex].advance;
  }

  drawLyricsBlockFurigana(gl, texCoordBuffer, positionBuffer, bitmapFont, romajiFontImage, lyricsBlock);
}

function drawLyricsBlockFurigana(gl, texCoordBuffer, positionBuffer, bitmapFont, romajiFontImage, lyricsBlock) {
  for (let i = 0; i < lyricsBlock.furigana.length; i++) {
    const furigana = lyricsBlock.furigana[i];
    const romaji = lyricsBlock.furiganaRomaji[i];
 
    if (romaji) {
      const romajiWidth = romaji.length * 16;

      let furiganaWidth = bitmapFont.glyphs[furigana.glyphs[furigana.glyphs.length - 1]].width;

      for (let j = 0; j < furigana.glyphs.length - 1; j++) {
        furiganaWidth += bitmapFont.glyphs[furigana.glyphs[j]].advance;
      }

      const romajiXPos = lyricsBlock.xPos + furigana.xPos + Math.floor((furiganaWidth - romajiWidth) / 2);

      drawRomajiBlock(gl, texCoordBuffer, positionBuffer, romajiFontImage, romaji, romajiXPos, lyricsBlock.yPos);
    } else {   
      let xOff = 0;

      for (let j = 0; j < furigana.glyphs.length; j++) {
        const glyphIndex = furigana.glyphs[j];
        const glyphHeight = bitmapFont.glyphs[glyphIndex].height;

        drawGlyph(
            gl, texCoordBuffer, positionBuffer,
            bitmapFont, glyphIndex,
            lyricsBlock.xPos + furigana.xPos + xOff, lyricsBlock.yPos - glyphHeight,
        );
    
        xOff += bitmapFont.glyphs[glyphIndex].advance;
      }
    }
  }
}

function quadToTriangles(x0, y0, x1, y1) {
  return [x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1];
}

function drawRomajiGlyph(gl, texCoordBuffer, positionBuffer, romajiFontImage, glyphIndex, xPos, yPos) {
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);

  const x0 = 16 * (glyphIndex % 16) / 256;
  const y0 = 16 * Math.floor(glyphIndex / 16) / 256;
  const x1 = x0 + 16 / 256;
  const y1 = y0 + 16 / 256;
  
  gl.bufferData(
    gl.ARRAY_BUFFER, 
    new Float32Array(quadToTriangles(x0, y0, x1, y1)),
    gl.STATIC_DRAW,
  );
  
  const romajiFontTexture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, romajiFontTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, romajiFontImage);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  const positions = quadToTriangles(xPos, yPos, xPos + 20, yPos + 32);
   
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
}

function drawGlyph(gl, texCoordBuffer, positionBuffer, bitmapFont, glyphIndex, xPos, yPos) {
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  
  gl.bufferData(
    gl.ARRAY_BUFFER, 
    new Float32Array(quadToTriangles(0.0, 0.0, 1.0, 1.0)),
    gl.STATIC_DRAW,
  );

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const glyph = bitmapFont.glyphs[glyphIndex];
  const glyphWidth = glyph.width;

  const textureData = glyph.data;
  const textureWidth = glyph.stride;
  const textureHeight = glyph.height;

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, textureWidth, textureHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, textureData);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  const positions = quadToTriangles(xPos, yPos, xPos + glyphWidth, yPos + textureHeight);
   
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
}

function render(bitmapFont, romajiFontImage, lyricsData) {
  const canvas = document.querySelector("#glcanvas");
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    premultipliedAlpha: false,
  });

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
  gl.clearColor(0.8, 0.8, 0.8, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
 
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = createProgram(gl, vertexShader, fragmentShader);
  
  gl.useProgram(program);

  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

  const positionBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();
  
  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  
  gl.enableVertexAttribArray(texCoordLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
  
  drawLyricsBlock(gl, texCoordBuffer, positionBuffer, bitmapFont, romajiFontImage, lyricsData[4]);
  drawLyricsBlock(gl, texCoordBuffer, positionBuffer, bitmapFont, romajiFontImage, lyricsData[5]);
  drawLyricsBlock(gl, texCoordBuffer, positionBuffer, bitmapFont, romajiFontImage, lyricsData[6]);
}

async function main() {
  const bitmapFonts = await fetch(BITMAP_FONT_FILENAME)
    .then(response => response.arrayBuffer())
    .then(data => parseBitmapFontData(data));

  const lyricsData = await fetch(JOY_U2_FILENAME)
    .then(response => response.arrayBuffer())
    .then(data => parseJoyU2Data(data, 2));

  const romajiFontImage = new Image();
  romajiFontImage.src = ROMAJI_FONT_FILENAME;
  
  await romajiFontImage.decode();

  populateLyricsDataWithRomaji(bitmapFonts[2], lyricsData);
  render(bitmapFonts[2], romajiFontImage, lyricsData);
}

function glyphCodeToKana(code) {
  if (code >= 0xa021 && code <= 0xa073) {
    return String.fromCharCode(code - 0xa020 + 0x3040);
  } else if (code >= 0xa121 && code <= 0xa176) {
    return String.fromCharCode(code - 0xa120 + 0x30a0);
  } else if (code >= 0xa321 && code <= 0xa373) {
    return String.fromCharCode(code - 0xa320 + 0x3040);
  } else if (code >= 0xa421 && code <= 0xa476) {
    return String.fromCharCode(code - 0x420 + 0x30a0);
  } else {
    return undefined;
  }
}

function getRomajiForGlyphs(bitmapFont, glyphs) {
  const glyphsRomaji = [];
  
  let i = 0;

  while (i < glyphs.length) {
    const glyphIndex = glyphs[i];
    const glyphKana = glyphCodeToKana(bitmapFont.glyphs[glyphIndex].code);
    
    if (!glyphKana) {
      i += 1;
      continue;
    }

    let nextGlyphIndex = null;

    if (i < glyphs.length - 1) {
      nextGlyphIndex = glyphs[i + 1];
    }
  
    if (nextGlyphIndex) {
      const nextGlyphKana = glyphCodeToKana(bitmapFont.glyphs[nextGlyphIndex].code);

      if (nextGlyphKana && (SOKUON_KANA.includes(glyphKana) || SUTEGANA.includes(nextGlyphKana))) {
        glyphsRomaji[i] = wanakana.toRomaji(glyphKana + nextGlyphKana);
        i += 2;

        continue;
      }
    }

    glyphsRomaji[i] = wanakana.toRomaji(glyphKana);
    i += 1;
  }

  return glyphsRomaji;
}

function getRomajiForLyricsBlock(bitmapFont, lyricsBlock) {
  const glyphsRomaji = getRomajiForGlyphs(bitmapFont, lyricsBlock.glyphs);
  const furiganaRomaji = []; 

  for (let i = 0; i < lyricsBlock.furigana.length; i++) {
    const furiganaBlockRomaji = getRomajiForGlyphs(bitmapFont, lyricsBlock.furigana[i].glyphs).join('');
    furiganaRomaji.push(furiganaBlockRomaji);
  }

  return { 
    glyphs: glyphsRomaji,
    furigana: furiganaRomaji,
  };
}

function populateLyricsDataWithRomaji(bitmapFont, lyricsData) {
  for (const lyricsBlock of lyricsData) {
    const romajiData = getRomajiForLyricsBlock(bitmapFont, lyricsBlock); 

    lyricsBlock.glyphsRomaji = romajiData.glyphs;
    lyricsBlock.furiganaRomaji = romajiData.furigana;
  }
}

main();
