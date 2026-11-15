import { MessageSquare, Plus, Trash2, X } from 'lucide-react';
import type { Conversation } from '../types/chat';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  isCreating: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Sidebar({
  conversations,
  activeId,
  isOpen,
  isCreating,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-slate-200 bg-slate-100 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Conversation history"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <span className="font-semibold tracking-tight text-slate-900 text-lg whitespace-nowrap shrink-0">
            SocraticCode
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{isCreating ? 'Creating...' : 'New Conversation'}</span>
          </button>
        </div>

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-slate-500">
            Sessions ({conversations.length})
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Saved sessions">
          {conversations.length === 0 ? (
            <div className="px-3 py-6 text-sm text-slate-500">
              No saved sessions yet. Start a new conversation above.
            </div>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conv) => {
                const isActive = conv.id === activeId;
                return (
                  <li key={conv.id} className="group relative">
                    <div
                      className={`flex items-center justify-between rounded-lg transition-colors ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                          : 'text-slate-700 hover:bg-slate-200/60 border border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(conv.id);
                          onClose();
                        }}
                        className="flex min-h-[44px] min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 rounded-lg"
                      >
                        <MessageSquare
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            isActive ? 'text-sky-700' : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-snug">
                            {conv.title}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                            <span>
                              {conv.messageCount} {conv.messageCount === 1 ? 'msg' : 'msgs'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelativeTime(conv.updatedAt)}</span>
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-100 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 lg:opacity-0 lg:group-hover:opacity-100"
                        aria-label={`Delete conversation ${conv.title}`}
                        title="Delete conversation"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          SQLite Persistent Storage · 10-Msg Window
        </div>
      </aside>
    </>
  );
}
