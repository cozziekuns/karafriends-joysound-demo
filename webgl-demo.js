import parseBitmapFontData from './modules/bitmapFontParser.js';
import parseJoyU2Data from './modules/joyU2Parser.js';

// Vertex Shader Program
const vsSource = `#version 300 es
  in vec2 a_position;
  in vec2 a_texCoord;
  in float a_scroll;
  
  uniform vec2 u_resolution;
  
  out vec2 v_texCoord;
  out vec2 v_position;
  out float v_scroll;

  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    
    v_texCoord = a_texCoord;
    v_position = a_position;
    v_scroll = a_scroll;
  }
`;

// Fragment Shader Program
const fsSource = `#version 300 es
  precision highp float;

  uniform sampler2D u_image;
  
  in vec2 v_texCoord;
  in vec2 v_position;
  in float v_scroll;

  out vec4 outColor;

  void main() {
    vec4 textureColor = texture(u_image, v_texCoord);

    if (textureColor.r == 1.0) {
      outColor = vec4(textureColor.r, textureColor.g, textureColor.b, 0.0);
    } else {
      if (v_position.x <= v_scroll) {
        outColor = vec4(1.0, textureColor.g, textureColor.b, textureColor.a);
      } else {
        outColor = vec4(1.0 - textureColor.r, 1.0 - textureColor.g, 1.0 - textureColor.b, textureColor.a);
      }
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

const TIMING_OFFSET = 1500;
// const TIMING_OFFSET = 11600; // Skip intro for testing

const SWITCH_SCREEN_WIDTH = 1280;
const SWITCH_SCREEN_HEIGHT = 720;

const ROMAJI_FONT_REAL_WIDTH = 20;
const ROMAJI_FONT_REAL_HEIGHT = 32;
const ROMAJI_FONT_ATLAS_WIDTH = 256;
const ROMAJI_FONT_ATLAS_HEIGHT = 256;
const ROMAJI_FONT_CELL_WIDTH = 16; // Width in px
const ROMAJI_FONT_CELL_HEIGHT = 16; // Height in px

// Used to create the texture atlas for the bitmap font
const BITMAP_FONT_MAX_WIDTH = 96;
const BITMAP_FONT_MAX_HEIGHT = 128;

function quadToTriangles(x0, y0, x1, y1) {
  return [x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1];
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

function getRealXPos(gl, xPos) {
  return xPos + (gl.canvas.width - SWITCH_SCREEN_WIDTH) / 2;
}

function getRealYPos(gl, yPos) {
  return yPos + (gl.canvas.height - SWITCH_SCREEN_HEIGHT) / 2;
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

function createBitmapFontTextureAtlasBitmaps(bitmapFont) {
  const textureAtlas = [];
  const numAtlasBitmaps = Math.ceil(bitmapFont.glyphs.length / 100);  

  for (let atlasIndex = 0; atlasIndex < numAtlasBitmaps; atlasIndex++) {
    const atlasWidth = BITMAP_FONT_MAX_WIDTH * 10;
    const atlasHeight = BITMAP_FONT_MAX_HEIGHT * 10;

    const textureBitmap = new Uint8Array(atlasWidth * atlasHeight);
  
    for (let i = 0; i < 100; i++) {
      const glyphIndex = atlasIndex * 100 + i;

      if (glyphIndex >= bitmapFont.glyphs.length) {
        break;
      }

      const glyph = bitmapFont.glyphs[glyphIndex];
      const xOff = (i % 10) * BITMAP_FONT_MAX_WIDTH;
      const yOff = Math.floor(i / 10) * BITMAP_FONT_MAX_HEIGHT;

      for (let glyphY = 0; glyphY < glyph.height; glyphY++) {
        for (let glyphX = 0; glyphX < glyph.stride; glyphX++) {
          const pixel = glyph.data[glyphY * glyph.stride + glyphX];

          textureBitmap[(yOff + glyphY) * atlasWidth + (xOff + glyphX)] = pixel;
        }
      }
    }

    textureAtlas[atlasIndex] = textureBitmap;
  }

  return textureAtlas;
}

function getScrollXPos(gl, lyricsBlock, refreshTime) {
  let xOff = 0;
    
  for (let i = 0; i < lyricsBlock.scrollEvents.length; i++) {
    const currScrollEvent = lyricsBlock.scrollEvents[i];
    
    if (refreshTime < currScrollEvent.time) {
      break;
    }
    
    let nextScrollEvent = null;
    
    if (i < lyricsBlock.scrollEvents.length - 1) {
      nextScrollEvent = lyricsBlock.scrollEvents[i + 1];
    }

    let delta; 

    if (!nextScrollEvent || refreshTime < nextScrollEvent.time) {
      delta = refreshTime - currScrollEvent.time; 
    } else {
      delta = nextScrollEvent.time - currScrollEvent.time;
    }

    xOff += (delta / 1000) * currScrollEvent.speed;
  }

  return getRealXPos(gl, lyricsBlock.xPos + xOff);
}

function drawRomajiBlock(gl, texCoordBuffer, positionBuffer, scrollBuffer, romajiFontTexture, romaji, x, y, scrollXPos) {
  for (let j = 0; j < romaji.length; j++) {
    const romajiGlyphIndex = romaji.charCodeAt(j) - 'a'.charCodeAt(0) + 33;

    drawRomajiGlyph(gl, texCoordBuffer, positionBuffer, scrollBuffer, romajiFontTexture, romajiGlyphIndex, x + j * 16, y - 36, scrollXPos);
  }
}

function drawLyricsBlock(gl, refreshTime, texCoordBuffer, positionBuffer, scrollBuffer, bitmapFont, romajiFontTexture, lyricsBlock) {
  const scrollXPos = getScrollXPos(gl, lyricsBlock, refreshTime);

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
    
    drawKanaGlyph(
      gl, texCoordBuffer, positionBuffer, scrollBuffer, 
      bitmapFont, glyphIndex, 
      lyricsBlock.xPos + xOff, lyricsBlock.yPos + yOff,
      scrollXPos,
    );
  
    if (romaji) {
      const romajiWidth = romaji.length * 16;
      const romajiXOff = Math.floor((bitmapFont.glyphs[glyphIndex].width - romajiWidth) / 2);

      drawRomajiBlock(gl, texCoordBuffer, positionBuffer, scrollBuffer, romajiFontTexture, romaji, lyricsBlock.xPos + xOff + romajiXOff, lyricsBlock.yPos, scrollXPos);
    }

    xOff += bitmapFont.glyphs[glyphIndex].advance;
  }

  drawLyricsBlockFurigana(gl, texCoordBuffer, positionBuffer, scrollBuffer, bitmapFont, romajiFontTexture, lyricsBlock, scrollXPos);
}

function drawLyricsBlockFurigana(gl, texCoordBuffer, positionBuffer, scrollBuffer, bitmapFont, romajiFontTexture, lyricsBlock, scrollXPos) {
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

      drawRomajiBlock(gl, texCoordBuffer, positionBuffer, scrollBuffer, romajiFontTexture, romaji, romajiXPos, lyricsBlock.yPos, scrollXPos);
    } else {   
      let xOff = 0;

      for (let j = 0; j < furigana.glyphs.length; j++) {
        const glyphIndex = furigana.glyphs[j];
        const glyphHeight = bitmapFont.glyphs[glyphIndex].height;

        drawKanaGlyph(
            gl, texCoordBuffer, positionBuffer,
            bitmapFont, glyphIndex,
            lyricsBlock.xPos + furigana.xPos + xOff, lyricsBlock.yPos - glyphHeight,
            scrollXPos,
        );
    
        xOff += bitmapFont.glyphs[glyphIndex].advance;
      }
    }
  }
}

function loadTextureFromAtlas(gl, texCoordBuffer, atlas, atlasWidth, atlasHeight, cellWidth, cellHeight, textureWidth, textureHeight, index) {
  const stride = Math.floor(atlasWidth / cellWidth);

  const x0 = cellWidth * (index % stride);
  const y0 = cellHeight  * Math.floor(index / stride);
  const x1 = x0 + textureWidth;
  const y1 = y0 + textureHeight;

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  
  gl.bufferData(
    gl.ARRAY_BUFFER, 
    new Float32Array(quadToTriangles(x0 / atlasWidth, y0 / atlasHeight, x1 / atlasWidth, y1 / atlasHeight)),
    gl.STATIC_DRAW,
  ); 

  gl.bindTexture(gl.TEXTURE_2D, atlas);
}

function drawRomajiGlyph(gl, texCoordBuffer, positionBuffer, scrollBuffer, romajiFontTexture, glyphIndex, xPos, yPos, scrollXPos) {
  const scrollArray = Array(6).fill(scrollXPos);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, scrollBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(scrollArray), gl.STATIC_DRAW);

  loadTextureFromAtlas(
    gl, texCoordBuffer, romajiFontTexture, 
    ROMAJI_FONT_ATLAS_WIDTH, ROMAJI_FONT_ATLAS_HEIGHT,
    ROMAJI_FONT_CELL_WIDTH, ROMAJI_FONT_CELL_HEIGHT, 
    ROMAJI_FONT_CELL_WIDTH, ROMAJI_FONT_CELL_HEIGHT,
    glyphIndex,
  );
  
  const realXPos = getRealXPos(gl, xPos);
  const realYPos = getRealYPos(gl, yPos);
  
  const positions = quadToTriangles(realXPos, realYPos, realXPos + ROMAJI_FONT_REAL_WIDTH, realYPos + ROMAJI_FONT_REAL_HEIGHT);
   
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
}

function drawKanaGlyph(gl, texCoordBuffer, positionBuffer, scrollBuffer, bitmapFont, glyphIndex, xPos, yPos, scrollXPos) {
  const scrollArray = Array(6).fill(scrollXPos);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, scrollBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(scrollArray), gl.STATIC_DRAW);
  
  const atlas = bitmapFont.textureAtlas[Math.floor(glyphIndex / 100)];
  const atlasWidth = BITMAP_FONT_MAX_WIDTH * 10;
  const atlasHeight = BITMAP_FONT_MAX_HEIGHT * 10; 

  const glyph = bitmapFont.glyphs[glyphIndex];
 
  loadTextureFromAtlas(
    gl, texCoordBuffer, atlas, 
    atlasWidth, atlasHeight,
    BITMAP_FONT_MAX_WIDTH, BITMAP_FONT_MAX_HEIGHT, 
    glyph.stride, glyph.height,
    glyphIndex % 100,
  );

  const realXPos = getRealXPos(gl, xPos);
  const realYPos = getRealYPos(gl, yPos);
  const realWidth = glyph.width;
  const realHeight = glyph.height;

  const positions = quadToTriangles(realXPos, realYPos, realXPos + realWidth, realYPos + realHeight);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
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

function createTextureFromImage(gl, image, width, height, colorFormat) {
  const texture = gl.createTexture();
  
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, colorFormat, width, height, 0, colorFormat, gl.UNSIGNED_BYTE, image);

  return texture;
}

function populateBitmapFontWithTextureAtlas(gl, bitmapFont) {
  bitmapFont.textureAtlas = [];
  
  const textureAtlasBitmaps = createBitmapFontTextureAtlasBitmaps(bitmapFont);
  const atlasWidth = BITMAP_FONT_MAX_WIDTH * 10;
  const atlasHeight = BITMAP_FONT_MAX_HEIGHT * 10;
  
  for (let i = 0; i < textureAtlasBitmaps.length; i++) {
    const bitmapFontTexture = createTextureFromImage(gl, textureAtlasBitmaps[i], atlasWidth, atlasHeight, gl.LUMINANCE);

    bitmapFont.textureAtlas.push(bitmapFontTexture);
  }
}

function processTimeline(timeline, lyricsData) {
  let activeLyricsBlocks = [];
  
  let currLyricsBlockIndex = 0;
  let scrollLyricsBlockIndex = -1;

  for (const currEvent of timeline) {
    const eventCode = currEvent.payload[0];

    if ([0, 1, 12, 13].includes(eventCode)) {
      if (eventCode % 2 === 0) {
        scrollLyricsBlockIndex += 1;
      }

      const scrollSpeed = currEvent.payload[1] * (eventCode <= 1 ? 10 : 1);
      const scrollLyricsBlock = lyricsData[scrollLyricsBlockIndex];  

      scrollLyricsBlock.scrollEvents.push({
        time: currEvent.currTime,
        speed: scrollSpeed,
      }); 
    } else if (currEvent.payload[0] === 5) {
      for (let i = 0; i < currEvent.payload[1]; i++) {
        const fadeoutIndex = activeLyricsBlocks.shift();

        lyricsData[fadeoutIndex].fadeoutTime = currEvent.currTime;
      }
    } else if (currEvent.payload[0] === 6) {
      for (let i = 0; i < currEvent.payload[1]; i++) {
        lyricsData[currLyricsBlockIndex].fadeinTime = currEvent.currTime;
        
        activeLyricsBlocks.push(currLyricsBlockIndex);
        currLyricsBlockIndex++;
      }
    }
  }
}

async function main() {
  const bitmapFonts = await fetch(BITMAP_FONT_FILENAME)
    .then(response => response.arrayBuffer())
    .then(data => parseBitmapFontData(data));

  const joyU2Data = await fetch(JOY_U2_FILENAME)
    .then(response => response.arrayBuffer())
    .then(data => parseJoyU2Data(data, 2));

  const lyricsData = joyU2Data.lyrics;
  const timeline = joyU2Data.timeline;

  const romajiFontImage = new Image();
  romajiFontImage.src = ROMAJI_FONT_FILENAME;
  
  await romajiFontImage.decode();

  const bitmapFont = bitmapFonts[2];
 
  populateLyricsDataWithRomaji(bitmapFont, lyricsData);
  processTimeline(timeline, lyricsData);

  const canvas = document.querySelector("#glcanvas");
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: false,
  });

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = createProgram(gl, vertexShader, fragmentShader);

  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
  const scrollLocation = gl.getAttribLocation(program, "a_scroll");
  const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");

  const positionBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();
  const scrollBuffer = gl.createBuffer();

  const romajiFontTexture = createTextureFromImage(gl, romajiFontImage, romajiFontImage.width, romajiFontImage.height, gl.RGBA);  
  populateBitmapFontWithTextureAtlas(gl, bitmapFont);
 
  const audio = document.getElementById("audio");
  audio.play();

  const fpsElem = document.querySelector("#fps");
  
  requestAnimationFrame(render);
  
  let then = 0;
  let refreshTime = 0;

  function render(now) {
    if (then > 0) {
      fpsElem.textContent = (1000 / (now - then)).toFixed(1);
    }

    then = now;
    
    refreshTime = audio.currentTime * 1000 + TIMING_OFFSET;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      
    gl.clearColor(0.8, 0.8, 0.8, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
   
    gl.useProgram(program);
   
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.enableVertexAttribArray(texCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(scrollLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, scrollBuffer);
    gl.vertexAttribPointer(scrollLocation, 1, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
 
    for (const lyricsBlock of lyricsData) {
      if (refreshTime >= lyricsBlock.fadeinTime && refreshTime < lyricsBlock.fadeoutTime) {
        drawLyricsBlock(gl, refreshTime, texCoordBuffer, positionBuffer, scrollBuffer, bitmapFont, romajiFontTexture, lyricsBlock);
      }
    }
   
    requestAnimationFrame(render);
  }

}

window.mainStart = main;
