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

export default parseBitmapFontData;
