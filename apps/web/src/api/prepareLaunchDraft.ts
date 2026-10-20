import {NewLaunchDraftFields as DraftFieldsSchema,tokenFieldIssues} from './shared';
import type { z } from 'zod';
import type { DraftFields, DraftReview, SavedLaunchDraft } from './shared';

export type PreparationStage = 'Saving token details…' | 'Uploading logo…' | 'Preparing metadata…' | 'Opening review…';
export interface PreparationPort {
 check(): void;
 stage(value: PreparationStage): void;
 save(fields: DraftFields, previous: SavedLaunchDraft | null): Promise<SavedLaunchDraft>;
 removeImage(draft: SavedLaunchDraft): Promise<SavedLaunchDraft>;
 upload(draft: SavedLaunchDraft, file: File): Promise<SavedLaunchDraft>;
 metadata(draft: SavedLaunchDraft): Promise<SavedLaunchDraft>;
 review(draft: SavedLaunchDraft): Promise<z.infer<typeof DraftReview>>;
 accept(draft: SavedLaunchDraft): void;
 uploaded(): void;
}
/** An explicit review action prepares assets; it never constructs or signs a launch transaction. */
export async function prepareLaunchDraft(input: {
 fields: DraftFields; draft: SavedLaunchDraft | null; file: File | null; removeImage: boolean; uploads: boolean;
 /** From backend capabilities: a Developer Buy can be prepared for this pair on this network. */
 devBuyAvailable?: boolean;
}, port: PreparationPort) {
 port.check();
 // Same rules as the server, checked before anything is saved or uploaded (the server re-checks before Pinata).
 const issue=tokenFieldIssues(input.fields,true)[0];if(issue)throw new Error(issue.message);
 const parsed=DraftFieldsSchema.safeParse(input.fields);if(!parsed.success)throw new Error(parsed.error.issues[0]?.message??'Check your token details.');
 if(input.fields.devBuyBps>0&&!input.devBuyAvailable)throw new Error('Developer Buy is unavailable for this pair or network. Turn it off to continue.');
 let draft = input.draft;
 const keep = (value: SavedLaunchDraft) => { port.check(); draft = value; port.accept(value); return value; };
 if (!draft || JSON.stringify(draft.fields) !== JSON.stringify(input.fields)) {
  port.stage('Saving token details…'); draft = keep(await port.save(input.fields, draft));
 }
 if (input.removeImage && !input.file && draft.image) draft = keep(await port.removeImage(draft));
 if (!input.uploads && (input.file || !draft.metadata)) return { draft, review: null,
  notice: 'Your draft is saved. Logo uploads are temporarily unavailable. Please try again later.' };
 if (input.file) {
  port.check(); port.stage('Uploading logo…'); draft = keep(await port.upload(draft, input.file)); port.uploaded();
 }
 if (!draft.image) throw new Error('Choose a logo to review your token.');
 if (!draft.metadata) {
  port.check(); port.stage('Preparing metadata…'); draft = keep(await port.metadata(draft));
 }
 port.check(); port.stage('Opening review…'); const review = await port.review(draft); port.check();
 if (review.draft.id !== draft.id || review.draft.wallet !== draft.wallet || review.draft.version !== draft.version)
  throw new Error('This draft changed while preparing it. Load the latest version and try again.');
 if (!review.readyForNextMilestone || review.issues.length) throw new Error('Your token could not be prepared. Check its details and logo, then try again.');
 return { draft, review, notice: '' };
}
