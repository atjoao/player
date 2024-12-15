import "./app.css"
import { ModeA, render } from "anime4k-webgpu"
import { useEffect, useRef, useState } from "react";
import "./lib/mkvExtract.ts"
import mkvExtract from "./lib/mkvExtract.ts";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [canPlay, setCanPlay] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [videoState, setVideoState] = useState({
    currentTime: 0,
    duration: 1,
    paused: true,
    muted: false,
    volume: 1,
    height: 0,
    width: 0,
    audioTracks: [],
    subtitleTracks: []
  });


  const toggleFullscreen = () => {
    const video = videoRef.current;

    const container = canvasRef.current?.parentElement;
    if (!container || !video) {
      return
    }

    if (!isFullscreen) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    async function loadVideo() {
      await mkvExtract("input_av1.mkv", (error: any, files: any) => {
        setVideoState((curr: any) => ({
          ...curr,
          audioTracks: [],
          subtitleTracks: []
        }));

        // load video here
        if (error) {
          console.error("Error extracting files", error);
          return;
        }

        console.log("Files extracted", files);
        files.forEach(element => {
          // clear audio tracks

          if (element.type) {
            console.log("hit!")
            console.log("Element type", element.type);
            if (element.type == "audio"){
              setVideoState((curr: any) => ({
                ...curr,
                audioTracks: [...curr.audioTracks, element]
              }));
            }

            if (element.type == "subtitle"){
              setVideoState((curr: any) => ({
                ...curr,
                subtitleTracks: [...curr.subtitleTracks, element]
              }));
            }
        }});
      })
    }

    loadVideo();

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const video = videoRef.current!;

    const handleTimeUpdate = (e: Event) => {
      setVideoState((curr) => ({
        ...curr,
        currentTime: (e.target as HTMLVideoElement).currentTime,
        duration: (e.target as HTMLVideoElement).duration
      }));
    };

    const handlePause = (e: Event) => {
      setVideoState((curr) => ({
        ...curr,
        paused: (e.target as HTMLVideoElement).paused
      }));
    };

    const handlePlay = (e: Event) => {
      setVideoState((curr) => ({
        ...curr,
        paused: (e.target as HTMLVideoElement).paused
      }));
    };

    const handleVolumeChange = (e: Event) => {
      setVideoState((curr) => ({
        ...curr,
        volume: (e.target as HTMLVideoElement).volume,
        muted: (e.target as HTMLVideoElement).muted
      }));
    };
    
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("pause", handlePause);
    video.addEventListener("play", handlePlay);
    video.addEventListener("volumechange", handleVolumeChange);

    const canvas = canvasRef.current!;


    // anime4k mode A init
    async function init() {

      await render({
        video, 
        canvas, 
        pipelineBuilder(device, inputTexture) {
          const video = videoRef.current!;
          const canvas = canvasRef.current!;
          const preset = new ModeA({
            device,
            inputTexture,
            nativeDimensions: { 
              width: isFullscreen ? screen.width : video.width,
              height: isFullscreen ? screen.height : video.height
            },
            targetDimensions: { 
              width: isFullscreen ? screen.width : canvas.width, 
              height: isFullscreen ? screen.height : canvas.height 
            },
          });
          return [preset];
        }
      })
    }

    init();

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("volumechange", handleVolumeChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }

  }, []);

  return (
    <>
      <div className={`videoContainer ${isFullscreen ? 'fullscreen' : ''}`}>
        <canvas 
          ref={canvasRef} 
          width={isFullscreen ? window.innerWidth : 1280} 
          height={isFullscreen ? window.innerHeight : 720} 
        ></canvas>

        {/* Control overlay */}
        <div className="videoControlsOverlay" >
          <button onClick={() => {
            const video = videoRef.current!;
            video.paused ? video.play() : video.pause();
          }}>
            {videoState.paused ? "Play" : "Pause"}
          </button>

          <button onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          </button>

          {/* Progress Bar */}
          <div className="progressBar" 
            onClick={(e) => {
              const video = videoRef.current!;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const percent = x / rect.width;
              video.currentTime = percent * video.duration;
            }}>
            <div className="linefill" style={{ width: `${(videoState.currentTime / videoState.duration) * 100}%` }}></div>
          </div>
        </div>
      </div>
      {/* Hidden video to link to canvas */}
      <select>
        {videoState.audioTracks.map((track: any, index: number) => (
          <option key={index} value={index}>{track.name}</option>
        ))}
      </select>
      <select>
        {videoState.subtitleTracks.map((track: any, index: number) => (
          <option key={index} value={index}>{track.name}</option>
        ))}
      </select>
      <video 
          width={isFullscreen ? screen.width : videoState.width} 
          height={isFullscreen ? screen.height : videoState.height} 
          controls 
          hidden
          ref={videoRef}
          onLoadedMetadata={(e) => {
            console.log("loaded metadata", e);
              setVideoState((curr) => ({
                ...curr,
                duration: (e.target as HTMLVideoElement).duration,
                height: (e.target as HTMLVideoElement).videoHeight,
                width: (e.target as HTMLVideoElement).videoWidth
              }));
              
          }}
          onCanPlay={(e) => {
            console.log("can play", e)
          }}
          onPlay={async () => {}}
              
        ></video>
    </>
  );
}

export default App;