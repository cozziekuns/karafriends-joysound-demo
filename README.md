# Karafriends Lol

Add required files (`BITMAP_FONT_FILENAME`, `JOY_U2_FILENAME`, `ROMAJI_FONT_FILENAME`, lemon.mp3). Then:

```
npm install
npx http-server
```

Doesn't work very well in Firefox because `Audio().currentTime` is [low precision](https://bugzilla.mozilla.org/show_bug.cgi?id=587465).
