export type WorldPhase = 'INITIALIZING'|'BUILDING_WORLD'|'STATIC_WORLD_READY'|'INTERACTIVE'|'FULLY_ACTIVE'|'ERROR';
/** Structural readiness follows completed work, never ticks, fixed delays, or assets. */
export class WorldReadiness {
  phase:WorldPhase='INITIALIZING';
  build(){if(this.phase==='INITIALIZING')this.phase='BUILDING_WORLD';}
  commit(input:{environment:boolean;pendingJobs:number;expectedChunks:number;builtChunks:number;catalogComplete:boolean}){
    if(this.presented||this.phase==='ERROR')return;
    if(input.environment&&input.pendingJobs===0&&input.expectedChunks>0&&input.builtChunks===input.expectedChunks&&input.catalogComplete)this.phase='STATIC_WORLD_READY';
  }
  present(){if(this.phase==='STATIC_WORLD_READY')this.phase='INTERACTIVE';}
  activate(){if(this.phase==='INTERACTIVE')this.phase='FULLY_ACTIVE';}
  fail(){this.phase='ERROR';}
  get presented(){return this.phase==='INTERACTIVE'||this.phase==='FULLY_ACTIVE';}
  get staticReady(){return this.phase==='STATIC_WORLD_READY'||this.presented;}
}
