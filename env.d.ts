/// <reference types="@moonlight-mod/types" />

declare module "@moonlight-mod/wp/memberCountFish_stores" {
  export * from "memberCount/webpackModules/stores";
}

declare module "@moonlight-mod/wp/messageLogger_diffUtils" {
  export interface DiffPart {
    type: "added" | "removed" | "unchanged";
    text: string;
  }
  export function createWordDiff(oldText: string, newText: string): DiffPart[];
  export function createMessageDiff(previousContent: string, currentContent: string): DiffPart[];
}

declare module "@moonlight-mod/wp/messageClickActions_main" {
  export function onMessageClick(event: MouseEvent, props: any): void;
}

declare module "@moonlight-mod/wp/moreUserTags_main" {
  export const localTags: Record<string, number> & Record<number, string>;
  export function getTagText(tagName: string): string;
  export function getTag(opts: {
    message?: unknown;
    user?: unknown;
    channel?: unknown;
    channelId?: string;
    isChat?: boolean;
  }): number | null;
  export function renderMessageDecoration(props: { message: unknown }): React.ReactNode;
  export function renderNicknameIcon(props: { userId: string }): React.ReactNode;
  export function renderMemberListDecorator(props: { user: unknown }): React.ReactNode;
}

declare module "@moonlight-mod/wp/messageLogger_main" {
  export function handleDelete(
    cache: unknown,
    data: { ids?: string[]; id?: string; channelId?: string; mlDeleted?: boolean },
    isBulk: boolean
  ): unknown;
  export function shouldIgnore(message: Record<string, unknown>, isEdit?: boolean): boolean;
  export function makeEdit(
    newMessage: { edited_timestamp: string },
    oldMessage: { content: string }
  ): { timestamp: Date; content: string };
  export function renderEdits(props: { message: Record<string, unknown> }): React.ReactNode;
  export function EditMarker(props: {
    message: Record<string, unknown>;
    className?: string;
    children?: React.ReactNode;
  }): React.ReactElement;
  export const DELETED_MESSAGE_COUNT: () => { ast: unknown[] };
  export function getMessageContextMenuItems(props: { message: Record<string, unknown> }): React.ReactElement[] | null;
  export function openHistoryModal(message: Record<string, unknown>): void;
  export function parseEditContent(
    content: string,
    message: { id: string; channel_id: string; content?: string },
    previousContent?: string
  ): React.ReactNode;
}
