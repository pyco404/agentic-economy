import {Github} from 'lucide-react';
import {project} from '../content/project';
import './project-links.css';
/** Lightweight official links; no embedded third-party social widgets. */
export function ProjectLinks({compact=false}:{compact?:boolean}){
 return <nav className={`project-links${compact?' is-compact':''}`} aria-label="Official Agentic Economy links">
  <a href={project.x} target="_blank" rel="noopener noreferrer" aria-label="Follow @useaeco on X" title="Follow @useaeco on X"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l7.2-8.3L.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z"/></svg></a>
  <a href={project.github} target="_blank" rel="noopener noreferrer" aria-label="View Agentic Economy on GitHub" title="View on GitHub"><Github size={17} aria-hidden="true"/></a>
 </nav>;
}
