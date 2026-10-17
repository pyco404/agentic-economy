"""CPU-only Kokoro narration plus an original, deterministic piano/pad underscore."""
from pathlib import Path
import json, wave
import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'; OUT.mkdir(exist_ok=True)
RATE=48000; DURATION=15

def wav(path, data, rate=RATE):
    pcm=(np.clip(data,-.999,.999)*32767).astype('<i2')
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1 if data.ndim==1 else data.shape[1]);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())

def generate():
    # Limit CPU threads so voice synthesis doesn't monopolize city capture.
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(ROOT/'cache/kokoro-v1.0.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    voice=Kokoro.from_session(session,str(ROOT/'cache/voices-v1.0.bin'))
    lines=[(.65,"Imagine a world where AI agents do more than answer questions."),
           (6.4,"A world where intelligence becomes visible through useful economic activity."),
           (12.25,"Welcome to Agentic Economy.")]
    narration=np.zeros(RATE*DURATION,dtype=np.float64); cues=[]
    for index,(start,text) in enumerate(lines):
        samples,sr=voice.create(text,voice='af_heart',speed=.96,lang='en-us')
        duration=len(samples)/sr
        limit=lines[index+1][0]-.25 if index+1<len(lines) else 14.8
        if start+duration>limit: raise RuntimeError(f'Natural narration exceeds scene: {text} ({duration:.2f}s). Adjust phrasing/pause; never truncate speech.')
        samples=np.interp(np.arange(round(duration*RATE))/RATE,np.arange(len(samples))/sr,samples)
        samples*=min(.15/max(np.sqrt(np.mean(samples**2)),1e-6), .82/max(np.max(np.abs(samples)),1e-6))
        offset=round(start*RATE);narration[offset:offset+len(samples)]+=samples
        cues.append({'start':start,'end':start+duration,'text':text})
        print(f'Voice {index+1}: {duration:.3f}s, {start:.3f}–{start+duration:.3f}s',flush=True)
    wav(OUT/'sample-narration.wav',narration)
    # Original composition: Cmaj7 → Am7 → Fmaj7 → Gsus → Cmaj9.
    t=np.arange(RATE*DURATION)/RATE; music=np.zeros((len(t),2)); rng=np.random.default_rng(41827)
    chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,60],[48,55,62,64]]
    for bar,chord in enumerate(chords):
        start=bar*3;dt=t-start; active=(dt>=0)&(dt<3.6); env=np.where(active,np.minimum(np.maximum(dt,0)/.65,1)*np.clip((3.6-dt)/.75,0,1),0)
        for n in chord:
            f=440*2**((n-69)/12)
            for channel,detune in enumerate([.9988,1.0012]):
                music[:,channel]+=.012*env*(np.sin(2*np.pi*f*detune*t)+.18*np.sin(2*np.pi*f*2*detune*t))
        for step,n in enumerate([chord[0]+12,chord[2]+12,chord[1]+12,chord[3]+12]):
            at=start+step*.75; d=t-at; e=np.where(d>=0,(1-np.exp(-np.maximum(d,0)*90))*np.exp(-np.maximum(d,0)*2.3),0)
            f=440*2**((n-69)/12); note=.055*e*(np.sin(2*np.pi*f*d)+.27*np.sin(2*np.pi*f*2.001*d)+.08*np.sin(2*np.pi*f*3.004*d))
            music[:,0]+=note*.83;music[:,1]+=note*.7
            delay=round(.23*RATE);music[delay:,1]+=note[:-delay]*.16
    # Soft reveal chimes, not explosive stock whooshes.
    for at in [.3,12]:
        d=t-at;e=np.where(d>=0,np.exp(-np.maximum(d,0)*3)*(1-np.exp(-np.maximum(d,0)*35)),0)
        music+=((np.sin(2*np.pi*1046.5*d)+np.sin(2*np.pi*1568*d))*.012*e)[:,None]
    envelope=np.minimum(t/1.2,1)*np.clip((15-t)/1.3,0,1);music*=envelope[:,None]
    wav(OUT/'sample-original-score.wav',music)
    # Narration-aware underscore, attack/release softened with a 160 ms kernel.
    activity=(np.abs(narration)>.008).astype(float)
    # Block envelope avoids an expensive full convolution at audio sample rate.
    blocks=activity.reshape(-1,480).max(axis=1); smooth=np.convolve(blocks,np.ones(25)/25,mode='same')
    duck=np.repeat(1-.65*np.clip(smooth*1.7,0,1),480)
    mix=music*duck[:,None]+narration[:,None]
    wav(OUT/'sample-mix.wav',mix)
    (OUT/'sample-cues.json').write_text(json.dumps(cues,indent=2))
    def stamp(seconds):
        ms=round(seconds*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (OUT/'sample-subtitles.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i,c in enumerate(cues))+'\n')
    (OUT/'audio-validation.json').write_text(json.dumps({'model':'Kokoro-82M v1.0 ONNX','voice':'af_heart','speed':.96,'provider':session.get_providers(),'duration':DURATION,'narration_peak':float(np.max(np.abs(narration))),'mix_peak':float(np.max(np.abs(mix))),'music':'Original deterministic procedural piano and pad composition; no third-party recording.','cues':cues},indent=2))

if __name__=='__main__':generate()
