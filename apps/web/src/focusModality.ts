/** Text inputs match :focus-visible after clicks too. Track navigation intent so
 * pointer editing stays minimal while Tab/arrow navigation restores the ring. */
export function installFocusModality(doc: Document) {
 const root=doc.documentElement;
 root.dataset.focusModality='keyboard';
 const pointer=()=>{root.dataset.focusModality='pointer';};
 const keyboard=(event:KeyboardEvent)=>{
  const target=event.target;
  const editing=target instanceof HTMLElement&&(target.isContentEditable||target instanceof HTMLTextAreaElement||target instanceof HTMLInputElement&&!['checkbox','radio','range','file','button','submit','reset','color'].includes(target.type));
  // Typing and moving a text cursor do not change how focus was acquired.
  if(event.key!=='Tab'&&editing)return;
  if(!event.altKey&&!event.ctrlKey&&!event.metaKey&&['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Enter',' ','Escape'].includes(event.key))root.dataset.focusModality='keyboard';
 };
 doc.addEventListener('pointerdown',pointer,true);
 doc.addEventListener('keydown',keyboard,true);
 return ()=>{doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('keydown',keyboard,true);delete root.dataset.focusModality;};
}
