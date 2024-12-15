// from https://github.com/pawitp/mkv-player/blob/master/src/lib/mkvExtract.js
import { Decoder, tools } from "ebml";
// @ts-ignore
import fileReaderStream from "filereader-stream";

async function mkvExtract(url, callback) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const blob = await response.blob();
    const reader = new fileReaderStream(blob, { chunkSize: 2 * 1024 * 1024 });
    handleStream(reader, callback);
  } catch (error) {
    console.error('Failed to fetch and stream file:', error);
  }
}

function handleStream(stream, callback) {
  const decoder = new Decoder();
  const tracks = [];
  const trackData = [];
  const files = [];

  let trackTypesTemp = []
  
  let currentFile = 0;
  let currentTimecode;
  let trackIndexTemp;
  let trackTypeTemp;
  let trackDataTemp;
  let trackLanguageTemp;
  let trackIndex;

  decoder.on("error", error => {
    callback(error);
    stream.destroy();
  });

  decoder.on("data", chunk => {
    switch (chunk[0]) {
      case "end":
        // if (chunk[1].name === 'Info') {
        //   stream.destroy()
        // }
        if (chunk[1].name === "TrackEntry") {
          if (trackTypeTemp === 0x11 || trackTypeTemp == 0x02) {
            tracks.push(trackIndexTemp);            
            trackData.push([trackDataTemp]);
            if (trackTypeTemp == 0x02){
              if (trackLanguageTemp === "und") trackLanguageTemp = "eng";
              trackTypesTemp.push(["audio", trackLanguageTemp ?? "eng"])
            } else {
              trackTypesTemp.push(["sub", trackLanguageTemp ?? "eng"])
            }
            console.log(trackData);
            trackLanguageTemp = null;
          }
        }
        break;
      case "tag":
        if (chunk[1].name === "Language") {
          trackLanguageTemp = chunk[1].data.toString();
        }
        if (chunk[1].name === "FileName") {
          if (!files[currentFile]) files[currentFile] = {};
          files[currentFile].name = chunk[1].data.toString();
        }
        if (chunk[1].name === "FileData") {
          if (!files[currentFile]) files[currentFile] = {};
          files[currentFile].data = chunk[1].data;
        }
        if (chunk[1].name === "TrackNumber") {
          trackIndexTemp = chunk[1].data[0];
        }
        if (chunk[1].name === "TrackType") {
          trackTypeTemp = chunk[1].data[0];
        }
        if (chunk[1].name === "CodecPrivate") {
          trackDataTemp = chunk[1].data.toString();
        }
        if (chunk[1].name === "SimpleBlock" || chunk[1].name === "Block") {
          const trackLength = tools.readVint(chunk[1].data);
          trackIndex = tracks.indexOf(trackLength.value);
          if (trackIndex !== -1) {
            const timestampArray = new Uint8Array(chunk[1].data).slice(
              trackLength.length,
              trackLength.length + 2
            );
            const timestamp = new DataView(timestampArray.buffer).getInt16(0);
            const lineData = chunk[1].data.slice(trackLength.length + 3);
            trackData[trackIndex].push(
              lineData.toString(),
              timestamp,
              currentTimecode
            );
          }
        }
        if (chunk[1].name === "Timecode") {
          const timecode = readUnsignedInteger(padZeroes(chunk[1].data));
          currentTimecode = timecode;
        }
        if (chunk[1].name === "BlockDuration" && trackIndex !== -1) {
          // the duration is in milliseconds
          const duration = readUnsignedInteger(padZeroes(chunk[1].data));
          trackData[trackIndex].push(duration);
        }
        break;
      default:
        // do nothing
    }
    if (
      files[currentFile] &&
      files[currentFile].name &&
      files[currentFile].data
    ) {
      currentFile++;
    }
  });

  stream.on("end", () => {
    trackData.forEach((entries, index) => {
      // get infomration stored
      if (trackTypesTemp[index][0] === "audio") {

        const audioBlob = new Blob(entries, { type: "audio/webm" }); // Wrap chunks as a blob
        
        files.push({
          type: "audio",
          name: "Audio_" + trackTypesTemp[index][1] + ".webm",
          data: audioBlob
        });

        return;
      }
      const heading = entries[0];
      const isASS = heading.includes("Format:");
      const formatFn = isASS ? formatTimestamp : formatTimestampSRT;
      const eventMatches = isASS
        ? heading.match(/\[Events\]\s+Format:([^\r\n]*)/)
        : [""];
      const headingParts = isASS ? heading.split(eventMatches[0]) : ["", ""];
      const fixedLines = [];
      for (let i = 1; i < entries.length; i += 4) {
        const line = entries[i];
        const lineTimestamp = entries[i + 1];
        const chunkTimestamp = entries[i + 2];
        const duration = entries[i + 3];
        const lineParts = isASS && line.split(",");
        const lineIndex = isASS ? lineParts[0] : (i - 1) / 4;
        const startTimestamp = formatFn(chunkTimestamp + lineTimestamp);
        const endTimestamp = formatFn(
          chunkTimestamp + lineTimestamp + duration
        );

        const fixedLine = isASS
          ? "Dialogue: " +
            [lineParts[1], startTimestamp, endTimestamp]
              .concat(lineParts.slice(2))
              .join(",")
          : lineIndex +
            1 +
            "\r\n" +
            startTimestamp.replace(".", ",") +
            " --> " +
            endTimestamp.replace(".", ",") +
            "\r\n" +
            line +
            "\r\n";

        if (fixedLines[lineIndex]) {
          fixedLines[lineIndex] += "\r\n" + fixedLine;
        } else {
          fixedLines[lineIndex] = fixedLine;
        }
      }
      const data =
        (isASS ? headingParts[0] + eventMatches[0] + "\r\n" : "") +
        fixedLines.join("\r\n") +
        headingParts[1] +
        "\r\n";

      files.push({
        type: "subtitle",
        name: "Subtitle_" + trackTypesTemp[index][1] + (isASS ? ".ass" : ".srt"),
        data
      });
    });

    if (files.length === 0) {
      callback(Error("No data found"));
      return;
    }

    callback(null, files);
  });

  stream.pipe(decoder);
}

function padZeroes(arr) {
  const len = Math.ceil(arr.length / 2) * 2;
  const output = new Uint8Array(len);
  output.set(arr, len - arr.length);
  return output.buffer;
}

function readUnsignedInteger(data) {
  const view = new DataView(data);
  return data.byteLength === 2 ? view.getUint16(0) : view.getUint32(0);
}

function formatTimestamp(timestamp) {
  const seconds = timestamp / 1000;
  const hh = Math.floor(seconds / 3600);
  let mm = Math.floor((seconds - hh * 3600) / 60);
  let ss = (seconds - hh * 3600 - mm * 60).toFixed(2);

  if (mm < 10) mm = `0${mm}`;
  if (ss < 10) ss = `0${ss}`;

  return `${hh}:${mm}:${ss}`;
}

function formatTimestampSRT(timestamp) {
  const seconds = timestamp / 1000;
  let hh = Math.floor(seconds / 3600);
  let mm = Math.floor((seconds - hh * 3600) / 60);
  let ss = (seconds - hh * 3600 - mm * 60).toFixed(3);

  if (hh < 10) hh = `0${hh}`;
  if (mm < 10) mm = `0${mm}`;
  if (ss < 10) ss = `0${ss}`;

  return `${hh}:${mm}:${ss}`;
}

export default mkvExtract;