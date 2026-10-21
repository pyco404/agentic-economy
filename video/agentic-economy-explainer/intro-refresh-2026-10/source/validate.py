"""Fail export review on timing, codec, blank-frame, missing-audio or clipping errors."""
from pathlib import Path
import json, subprocess, wave, hashlib
import numpy as np
from resources import LEGACY
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output';video=OUT/'agentic-economy-intro-refresh-15s-review.mp4'
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(video)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['codec_name'],v['r_frame_rate'])==(1080,1350,'h264','30/1')
assert int(v['nb_frames'])==450 and float(v['duration'])==15
assert abs(float(probe['format']['duration'])-15)<.001 and a['codec_name']=='aac'
subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],check=True)
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(video),'-vf','fps=1,scale=108:135','-f','rawvideo','-pix_fmt','rgb24','-'])
frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,135,108,3)
contrast=[float(f.std()) for f in frames];assert min(contrast)>12, 'Blank/black/flat frame detected'
assert np.mean(np.abs(frames[-1].astype(float)-frames[0]))>1, 'Visual motion missing'
checks={}
for name in ['sample-narration.wav','sample-original-score.wav','sample-mix.wav']:
    with wave.open(str(OUT/name)) as wav:
        assert wav.getnframes()/wav.getframerate()==15
        samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(float)/32768
    peak=float(np.max(np.abs(samples)));rms=float(np.sqrt(np.mean(samples*samples)))
    assert .0001<rms<.3 and peak<.99, f'Missing or clipped audio: {name}'
    checks[name]={'peak':peak,'rms':rms,'duration':15}
decoded_audio=subprocess.check_output(['ffmpeg','-v','error','-i',str(video),'-vn','-ac','2','-ar','48000','-f','f32le','-'])
decoded=np.frombuffer(decoded_audio,dtype='<f4');encoded_peak=float(np.max(np.abs(decoded)))
assert .0001<float(np.sqrt(np.mean(decoded**2))) and encoded_peak<.99, 'Missing/clipped encoded audio'
checks['encoded_aac']={'peak':encoded_peak,'rms':float(np.sqrt(np.mean(decoded**2)))}
cues=json.loads((OUT/'sample-cues.json').read_text());assert len(cues)==3
for i,cue in enumerate(cues):
    assert 0<=cue['start']<cue['end']<=15
    if i:assert cues[i-1]['end']<=cue['start']
# Keep software/model provenance next to the review output, never in runtime code.
model_hashes={name:hashlib.sha256((LEGACY/'cache'/name).read_bytes()).hexdigest() for name in ['kokoro-v1.0.onnx','voices-v1.0.bin']}
assert model_hashes=={'kokoro-v1.0.onnx':'7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5','voices-v1.0.bin':'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'}, 'Model resources changed'
capture=json.loads((ROOT/'cache/capture-evidence.json').read_text());assert capture['initial']['worldState']=='FULLY_ACTIVE' and capture['initial']['revealPending']=='0' and capture['initial']['revealSceneryReady']=='true'
assert capture['initial']['railway'] and capture['initial']['mirroredRailway']
assert capture['initial']['geometryBuilds']==capture['final']['geometryBuilds'] and not capture['errors']
result={'status':'passed','duration':15,'resolution':[1080,1350],'fps':30,'frames':450,'video_codec':v['codec_name'],'audio_codec':a['codec_name'],'sampled_frame_contrast':contrast,'audio':checks,'subtitle_cues':cues,'model_sha256':model_hashes,'notes':['15-second approval sample only; full 120-second film not yet rendered.','Fresh current main city recording at 1080×1080, conformed to 30 FPS; native 1080×1350 titles/captions. No old city plates or explanatory-video dashboard shots.','No real economic transactions or claims of live roadmap functionality.']}
(OUT/'validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
