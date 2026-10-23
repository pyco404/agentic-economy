/** Text inputs match :focus-visible after clicks too. Track navigation intent so
 * pointer editing stays minimal while Tab/arrow navigation restores the ring. */
export function installFocusModality(doc: Document) {
 const root=doc.documentElement;
 root.dataset.focusModality='keyboard';
 const pointer=()=>{root.dataset.focusModality='pointer';};
 const keyboard=(event:KeyboardEvent)=>{
  if(!event.altKey&&!event.ctrlKey&&!event.metaKey&&['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Enter',' ','Escape'].includes(event.key))root.dataset.focusModality='keyboard';
 };
 doc.addEventListener('pointerdown',pointer,true);
 doc.addEventListener('keydown',keyboard,true);
 return ()=>{doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('keydown',keyboard,true);delete root.dataset.focusModality;};
}
