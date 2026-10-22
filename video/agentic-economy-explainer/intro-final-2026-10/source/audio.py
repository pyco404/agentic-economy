"""CPU-only Kokoro narration plus an original, deterministic piano/pad underscore."""
from pathlib import Path
import json, wave, hashlib
import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro
from resources import LEGACY
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'; OUT.mkdir(exist_ok=True)
RATE=48000; DURATION=120

def wav(path, data, rate=RATE):
    pcm=(np.clip(data,-.999,.999)*32767).astype('<i2')
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1 if data.ndim==1 else data.shape[1]);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())

def generate():
    # Limit CPU threads so voice synthesis doesn't monopolize city capture.
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(LEGACY/'cache/kokoro-v1.0.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    voice=Kokoro.from_session(session,str(LEGACY/'cache/voices-v1.0.bin'))
    scenes=json.loads((ROOT/'source/scenes.json').read_text())
    lines=[]
    for scene in scenes:
        sentences=scene['narration'].replace('? ', '?|').replace('. ', '.|').split('|')
        prepared=[]
        for text in sentences:
            cached=ROOT/'cache'/('voice-'+hashlib.sha256(text.encode()).hexdigest()[:16]+'.npz')
            if cached.exists():
                saved=np.load(cached);samples=saved['samples'];sr=int(saved['sr'])
            else:
                samples,sr=voice.create(text,voice='af_heart',speed=1.02,lang='en-us')
                np.savez(cached,samples=samples,sr=sr)
            print(f'Synthesized: {text[:65]} ({len(samples)/sr:.2f}s)',flush=True)
            prepared.append((text,samples,sr))
        spoken=sum(len(s)/sr for _,s,sr in prepared)
        available=scene['end']-scene['start']-.8
        if spoken+.16*(len(prepared)-1)>available:
            raise RuntimeError(f'Scene {scene["start"]} narration too long: {spoken:.2f}s in {available:.2f}s')
        gap=min(.75,max(.16,(available-spoken)/max(1,len(prepared)-1)))
        at=scene['start']+.4
        for text,samples,sr in prepared:
            lines.append((at,text,samples,sr,scene['end']-.15))
            at+=len(samples)/sr+gap
    narration=np.zeros(RATE*DURATION,dtype=np.float64); cues=[]
    for index,(start,text,samples,sr,limit) in enumerate(lines):
        duration=len(samples)/sr
        if start+duration>limit: raise RuntimeError(f'Natural narration exceeds scene: {text} ({duration:.2f}s). Adjust phrasing/pause; never truncate speech.')
        samples=np.interp(np.arange(round(duration*RATE))/RATE,np.arange(len(samples))/sr,samples)
        samples*=min(.15/max(np.sqrt(np.mean(samples**2)),1e-6), .82/max(np.max(np.abs(samples)),1e-6))
        offset=round(start*RATE);narration[offset:offset+len(samples)]+=samples
        cues.append({'start':start,'end':start+duration,'text':text})
        print(f'Voice {index+1}: {duration:.3f}s, {start:.3f}–{start+duration:.3f}s',flush=True)
    wav(OUT/'final-narration.wav',narration)
    # Original continuous arrangement. Synthesize only each note's audible span.
    t=np.arange(RATE*DURATION)/RATE;music=np.zeros((len(t),2))
    chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,60],[48,55,62,64]]
    for bar in range(40):
        chord=chords[bar%len(chords)];start=bar*3
        offset=round(start*RATE);count=min(round(3.6*RATE),len(t)-offset)
        dt=np.arange(count)/RATE;global_t=dt+start
        env=np.minimum(dt/.65,1)*np.clip((3.6-dt)/.75,0,1)
        for n in chord:
            f=440*2**((n-69)/12)
            for channel,detune in enumerate([.9988,1.0012]):
                music[offset:offset+count,channel]+=.012*env*(np.sin(2*np.pi*f*detune*global_t)+.18*np.sin(2*np.pi*f*2*detune*global_t))
        for step,n in enumerate([chord[0]+12,chord[2]+12,chord[1]+12,chord[3]+12]):
            at=start+step*.75;pos=round(at*RATE);count=min(round(5*RATE),len(t)-pos)
            d=np.arange(count)/RATE;e=(1-np.exp(-d*90))*np.exp(-d*2.3)
            f=440*2**((n-69)/12);note=.055*e*(np.sin(2*np.pi*f*d)+.27*np.sin(2*np.pi*f*2.001*d)+.08*np.sin(2*np.pi*f*3.004*d))
            music[pos:pos+count,0]+=note*.83;music[pos:pos+count,1]+=note*.7
            delayed=pos+round(.23*RATE);length=min(count,len(t)-delayed)
            if length>0:music[delayed:delayed+length,1]+=note[:length]*.16
        print(f'Scored bar {bar+1}/40',flush=True) if bar%10==0 else None
    for at in [.3,20,45,65,90,108]:
        pos=round(at*RATE);count=min(round(5*RATE),len(t)-pos);d=np.arange(count)/RATE
        e=np.exp(-d*3)*(1-np.exp(-d*35))
        music[pos:pos+count]+=((np.sin(2*np.pi*1046.5*d)+np.sin(2*np.pi*1568*d))*.012*e)[:,None]
    envelope=np.minimum(t/1.2,1)*np.clip((120-t)/3,0,1);music*=envelope[:,None]
    wav(OUT/'final-original-score.wav',music)
    # Narration-aware underscore, attack/release softened with a 160 ms kernel.
    activity=(np.abs(narration)>.008).astype(float)
    # Block envelope avoids an expensive full convolution at audio sample rate.
    blocks=activity.reshape(-1,480).max(axis=1); smooth=np.convolve(blocks,np.ones(25)/25,mode='same')
    duck=np.repeat(1-.65*np.clip(smooth*1.7,0,1),480)
    mix=music*duck[:,None]+narration[:,None]
    wav(OUT/'final-mix.wav',mix)
    (OUT/'final-cues.json').write_text(json.dumps(cues,indent=2))
    def stamp(seconds):
        ms=round(seconds*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (OUT/'final-subtitles.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i,c in enumerate(cues))+'\n')
    (OUT/'audio-validation.json').write_text(json.dumps({'model':'Kokoro-82M v1.0 ONNX','voice':'af_heart','speed':1.02,'provider':session.get_providers(),'duration':DURATION,'narration_peak':float(np.max(np.abs(narration))),'mix_peak':float(np.max(np.abs(mix))),'music':'Original deterministic procedural piano and pad composition; no third-party recording.','cues':cues},indent=2))

if __name__=='__main__':generate()
