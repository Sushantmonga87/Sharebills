import {
  Bell,
  BellOff,
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import SpaceLongPressActions from './SpaceLongPressActions';
import EmptyState from '../common/EmptyState';

export default function DesktopSpacesTab({
  groups,
  activeCount,
  pinnedCount,
  archivedCount,
  spaceFilter,
  onSpaceFilterChange,
  groupMetrics,
  rentRecords = [],
  unreadMessagesByGroup = {},
  unreadChatByGroup = {},
  showUnreadIndicators = false,
  users,
  user,
  pinnedGroupIds,
  mutedGroupIds,
  archivedGroupIds,
  mobilePreview = false,
  onOpenGroup,
  onUpdateGroupPreference,
  onQuickAdd,
  onCopyInvite,
  copiedCodeId,
  onCreateGroup,
  onJoinGroup,
}) {
  return (
    <section className={`w-full rounded-3xl ${
      groups.length === 0 ? 'md:flex md:min-h-[calc(100dvh-9rem)] md:flex-col' : ''
    }`}>
      <div className="page-heading-bar shared-spaces-heading-bar mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="page-heading flex min-w-0 items-center gap-2.5 rounded-full p-0 pr-4">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
            {user?.photoDataUrl ? (
              <img src={user.photoDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (user?.username || 'U').charAt(0).toUpperCase()
            )}
          </span>
          <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900">
            Shared Spaces
          </h1>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className={`page-heading-controls hidden items-center gap-1 rounded-full p-1.5 ${mobilePreview ? '' : 'md:flex'}`}>
            {[
              { id: 'active', label: `Active (${activeCount})` },
              { id: 'pinned', label: `Pinned (${pinnedCount})` },
              { id: 'archived', label: `Archived (${archivedCount})` },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => onSpaceFilterChange(filter.id)}
                aria-pressed={spaceFilter === filter.id}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                  spaceFilter === filter.id
                    ? 'bg-gradient-to-b from-blue-600 to-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className={`hidden items-center gap-2 ${mobilePreview ? '' : 'md:flex'}`}>
            {onCreateGroup && (
              <button
                type="button"
                onClick={onCreateGroup}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
              >
                <Plus size={14} />
                Create space
              </button>
            )}
            {onJoinGroup && (
              <button
                type="button"
                onClick={onJoinGroup}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:text-blue-700"
              >
                <UserPlus size={14} />
                Join space
              </button>
            )}
          </div>
          <label className={`page-heading-controls relative flex h-10 max-w-[58%] flex-shrink items-center gap-2 rounded-full px-3 text-xs font-semibold text-slate-700 ${mobilePreview ? '' : 'md:hidden'}`}>
            <span className="truncate">
              {spaceFilter === 'pinned' ? `Pinned (${pinnedCount})` : spaceFilter === 'archived' ? `Archived (${archivedCount})` : `Active (${activeCount})`}
            </span>
            <ChevronDown size={14} className="flex-shrink-0 text-slate-400" />
            <select
              aria-label="Filter spaces"
              value={spaceFilter}
              onChange={(event) => onSpaceFilterChange(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="active">Active ({activeCount})</option>
              <option value="pinned">Pinned ({pinnedCount})</option>
              <option value="archived">Archived ({archivedCount})</option>
            </select>
          </label>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            spaceFilter === 'archived'
              ? 'No archived spaces'
              : spaceFilter === 'pinned'
                ? 'No pinned spaces yet'
                : 'No active spaces found'
          }
          description={
            spaceFilter === 'archived'
              ? 'Archived spaces will appear here when you archive a room.'
              : spaceFilter === 'pinned'
                ? 'Pin an active space to keep it close at hand.'
                : 'Create a new room or join an existing flat using a 6-digit invite code.'
          }
          actionLabel={spaceFilter === 'active' ? (onCreateGroup ? 'Create a space' : undefined) : undefined}
          onAction={spaceFilter === 'active' ? onCreateGroup : undefined}
          className={groups.length === 0 ? 'md:flex-1' : ''}
        />
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${mobilePreview ? '' : 'md:grid-cols-2'}`}>
          {groups.map((group) => {
            const metrics = groupMetrics.byGroup[group.id] || {
              myNet: 0,
              roomSpend: 0,
              billCount: 0,
              latestExpense: null,
            };
            const isPinned = pinnedGroupIds.includes(group.id);
            const isMuted = mutedGroupIds.includes(group.id);
            const isArchived = archivedGroupIds.includes(group.id);
            const unreadCount = unreadMessagesByGroup[group.id] || 0;
            const unreadChatCount = unreadChatByGroup[group.id] || 0;
            const hasRentDue = rentRecords.some((rent) => (
              rent.groupId === group.id &&
              Number(rent.shares?.[user?.id]) > 0 &&
              !rent.payments?.[user?.id]?.paid
            ));

            return (
              <SpaceLongPressActions
                key={group.id}
                groupName={group.name}
                isPinned={isPinned}
                isArchived={isArchived}
                onTogglePin={() => onUpdateGroupPreference(group.id, 'pinnedGroupIds', !isPinned)}
                onToggleArchive={() => onUpdateGroupPreference(group.id, 'archivedGroupIds', !isArchived)}
              >
              <article
                onClick={() => onOpenGroup(group.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenGroup(group.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className="liquid-glass-interactive group flex min-w-0 cursor-pointer flex-col justify-between rounded-2xl p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-blue-600 to-blue-600 text-base font-extrabold text-white shadow-sm">
                        {group.imageDataUrl ? (
                          <img src={group.imageDataUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          group.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className={`truncate text-base font-extrabold text-slate-900 transition-colors group-hover:text-blue-600 ${mobilePreview ? '' : 'md:text-sm'}`}>
                            {group.name}
                          </h2>
                          {isPinned && (
                            <Pin size={12} aria-label="Pinned" title="Pinned" className="flex-shrink-0 text-blue-600" />
                          )}
                          {hasRentDue && (
                            <button
                              type="button"
                              title="Rent is due · Open rent details"
                              aria-label={`Rent is due in ${group.name}. Open rent details.`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenGroup(group.id, 'members');
                              }}
                              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition-colors hover:bg-amber-200"
                            >
                              <CircleDollarSign size={15} />
                            </button>
                          )}
                          {showUnreadIndicators && unreadCount > 0 && !isArchived && (
                            <span
                              title={`${unreadCount} unread item${unreadCount === 1 ? '' : 's'}`}
                              className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold leading-none text-white"
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                          {isMuted && <BellOff size={12} className="flex-shrink-0 text-amber-500" />}
                        </div>
                        <p className={`truncate text-sm text-slate-500 ${mobilePreview ? '' : 'md:text-xs'}`}>
                          {group.description || `${group.members?.length || 1} members`}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-xl border px-2.5 py-1 font-mono text-xs font-extrabold ${
                        metrics.myNet > 0.01
                          ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700'
                          : metrics.myNet < -0.01
                            ? 'border-rose-200/80 bg-rose-50/90 text-rose-700'
                            : 'border-slate-200/60 bg-slate-100/80 text-slate-600'
                      }`}
                    >
                      {metrics.myNet > 0.01
                        ? `+${formatCurrency(metrics.myNet, group.currency)}`
                        : metrics.myNet < -0.01
                          ? `-${formatCurrency(Math.abs(metrics.myNet), group.currency)}`
                          : 'Settled'}
                    </span>
                  </div>

                  <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl border border-white/80 bg-white/60 px-3 py-2 text-xs">
                    <div>
                      <span className={`block text-xs font-bold uppercase tracking-wider text-slate-400 ${mobilePreview ? '' : 'md:text-[10px]'}`}>
                        Room Spend
                      </span>
                      <span className="font-mono font-extrabold text-slate-800">
                        {formatCurrency(metrics.roomSpend, group.currency)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className={`block text-xs font-bold uppercase tracking-wider text-slate-400 ${mobilePreview ? '' : 'md:text-[10px]'}`}>
                        Latest Bill
                      </span>
                      <span className="block truncate font-semibold text-slate-700">
                        {metrics.latestExpense?.title || 'No bills yet'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-200/50 pt-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex -space-x-1.5 overflow-hidden">
                      {(group.members || []).slice(0, 4).map((memberId) => {
                        const member = users.find((candidate) => candidate.id === memberId);
                        const label = memberId === user.id
                          ? user.username
                          : member?.username || 'M';
                        return (
                          <span
                            key={memberId}
                            title={label}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-[10px] font-extrabold text-blue-700"
                          >
                            {(label || 'M').charAt(0).toUpperCase()}
                          </span>
                        );
                      })}
                    </div>
                    {group.inviteCode && (
                      <button
                        type="button"
                        onClick={(event) => onCopyInvite(event, group)}
                        title="Copy invite code"
                        className={`inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 hover:bg-white ${mobilePreview ? '' : 'md:text-[10px]'}`}
                      >
                        {copiedCodeId === group.id ? (
                          <Check size={10} className="text-emerald-600" />
                        ) : (
                          <Copy size={10} />
                        )}
                        <span>{group.inviteCode}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUpdateGroupPreference(group.id, 'pinnedGroupIds', !isPinned);
                      }}
                      title={isPinned ? 'Unpin space' : 'Pin space'}
                      aria-label={isPinned ? `Unpin ${group.name}` : `Pin ${group.name}`}
                      className={`${mobilePreview ? 'hidden' : 'hidden md:flex'} h-7 w-7 items-center justify-center rounded-xl ${
                        isPinned
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-slate-400 hover:bg-white hover:text-blue-600'
                      }`}
                    >
                      {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUpdateGroupPreference(group.id, 'archivedGroupIds', !isArchived);
                      }}
                      title={isArchived ? 'Restore space' : 'Archive space'}
                      aria-label={isArchived ? `Restore ${group.name}` : `Archive ${group.name}`}
                      className={`${mobilePreview ? 'hidden' : 'hidden md:flex'} h-7 w-7 items-center justify-center rounded-xl ${
                        isArchived
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-slate-400 hover:bg-white hover:text-blue-600'
                      }`}
                    >
                      {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onQuickAdd(group.id);
                      }}
                      title="Quick add bill to this space"
                      className="inline-flex h-7 items-center gap-1 rounded-xl bg-gradient-to-b from-blue-600 to-blue-600 px-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95"
                    >
                      <Plus size={12} />
                      <span>Bill</span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenGroup(group.id, 'chat');
                      }}
                      title={showUnreadIndicators && unreadChatCount > 0
                        ? `Open group chat (${unreadChatCount} unread)`
                        : 'Open group chat'}
                      aria-label={`Open ${group.name} chat${showUnreadIndicators && unreadChatCount > 0 ? `, ${unreadChatCount} unread messages` : ''}`}
                      className={`relative flex h-7 w-7 items-center justify-center rounded-xl ${
                        showUnreadIndicators && unreadChatCount > 0
                          ? 'bg-rose-50 text-rose-600'
                          : 'text-slate-400 hover:bg-white hover:text-blue-600'
                      }`}
                    >
                      <MessageSquare size={14} />
                      {showUnreadIndicators && unreadChatCount > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-rose-600"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUpdateGroupPreference(group.id, 'mutedGroupIds', !isMuted);
                      }}
                      aria-label={isMuted ? `Unmute ${group.name}` : `Mute ${group.name}`}
                      className={`flex h-7 w-7 items-center justify-center rounded-xl ${
                        isMuted ? 'bg-amber-50 text-amber-700' : 'text-slate-400 hover:bg-white'
                      }`}
                    >
                      {isMuted ? <BellOff size={14} /> : <Bell size={14} />}
                    </button>
                  </div>
                </div>
                </article>
              </SpaceLongPressActions>
            );
          })}
        </div>
      )}
    </section>
  );
}
