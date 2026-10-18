import{describe,it,expect}from'vitest';
import{WorldReadiness}from'./worldReadiness';
describe('structural world lifecycle',()=>{
 const ready={environment:true,pendingJobs:0,expectedChunks:16,builtChunks:16,catalogComplete:true};
 it('requires the full static assembly and a completed render before interaction',()=>{
  const w=new WorldReadiness();expect(w.phase).toBe('INITIALIZING');w.build();expect(w.phase).toBe('BUILDING_WORLD');
  for(const partial of[{...ready,environment:false},{...ready,pendingJobs:1},{...ready,builtChunks:15},{...ready,catalogComplete:false}]){w.commit(partial);expect(w.staticReady).toBe(false);w.present();expect(w.presented).toBe(false);}
  w.commit(ready);expect(w.phase).toBe('STATIC_WORLD_READY');expect(w.presented).toBe(false);w.present();expect(w.phase).toBe('INTERACTIVE');w.activate();expect(w.phase).toBe('FULLY_ACTIVE');
 });
 it('does not replay loading after live changes, route switches or late camera chunks',()=>{const w=new WorldReadiness();w.build();w.commit(ready);w.present();w.activate();w.build();w.commit({...ready,environment:false,builtChunks:2});expect(w.phase).toBe('FULLY_ACTIVE');});
 it('exposes failure rather than waiting indefinitely',()=>{const w=new WorldReadiness();w.build();w.fail();w.commit(ready);w.present();expect(w.phase).toBe('ERROR');expect(w.presented).toBe(false);});
});
