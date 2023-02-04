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
    scrollEvents: [],
    fadeinTime: null,
    fadeoutTime: null,
    glyphs,
    glyphsRomaji: null,
    furiganaRomaji: null,
    furigana,
  };
}

function parseJoyU2LyricsData(data, offset, size) {
  const lyricsView = new DataView(data, offset, size);
  const lyricsBlocks = [];

  let currOffset = 30; // Ignore colours for now

  while (currOffset < size) {
    const block = parseLyricsBlock(lyricsView, currOffset);
    lyricsBlocks.push(block);

    currOffset += block.blockSize;
  }

  return lyricsBlocks;
}

function parseJoyU2TimingData(data, offset, size) {
  const timingView = new DataView(data, offset, size);
  const events = [];

  let currOffset = 0;
  let currTime = 0;

  while (currOffset < size) {
    let delta = 0;

    while (timingView.getInt8(currOffset) < 0) {
      delta = delta << 7;
      delta += timingView.getUint8(currOffset) & 0x7F;

      currOffset += 1;
    }

    delta = delta << 7;
    delta += timingView.getUint8(currOffset) & 0x7F;
    
    currTime += delta;
    currOffset += 1;

    const payloadSize = timingView.getInt8(currOffset);
    currOffset += 1;
    
    const payloadBytes = [];

    for (let i = 0; i < payloadSize; i++) {
      payloadBytes.push(timingView.getUint8(currOffset + i));
    }

    currOffset += payloadSize;

    events.push({
      currTime: currTime + 1800,
      payload: payloadBytes,
    });
  }

  return events;
}

function parseJoyU2Data(data, font) {
  const lyricsBlocks = [];

  const view = new DataView(data, 6, 4 * 8);
  
  const lyricsOffset = view.getUint32(4 + font * 8);
  const timingOffset = view.getUint32(8 + font * 8);
  const timingEnd = view.getUint32(12 + font * 8);

  return {
    lyrics: parseJoyU2LyricsData(data, lyricsOffset, timingOffset - lyricsOffset),
    timeline: parseJoyU2TimingData(data, timingOffset, timingEnd - timingOffset),
  };
}

export default parseJoyU2Data;
