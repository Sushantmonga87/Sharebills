import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import {
  AlertTriangle,
  Copy,
  Trash2,
  Edit2,
  Check,
  X,
  LogOut,
  Users,
  Shield,
  Layers,
  Link,
  Share2,
  QrCode,
  UserPlus,
  ImagePlus,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { calculateSettlements, GROUP_DELETE_BALANCE_TOLERANCE } from '../../utils/settlement';
import { compressImageFile } from '../../utils/compressImage';
import { GROUP_CURRENCIES, formatCurrency } from '../../utils/currency';
import GroupRentPanel from './GroupRentPanel';

export default function MembersTab({
  group,
  users,
  currentUser,
  expenses,
  monthlyRents = [],
  onCreateRent,
  onMarkRentPaid,
  onDeleteRent,
  onDeleteGroup,
  onUpdateGroup,
  onLeaveGroup,
  showToast,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState(group.name || '');
  const [savingName, setSavingName] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const inviteUrl = `${window.location.origin}/?join=${encodeURIComponent(group.inviteCode)}`;

  const isAdmin = group.createdBy === currentUser.id;
  const { balances } = calculateSettlements(expenses, group.members);
  const myBalance = balances[currentUser.id] || 0;
  const hasMyOutstandingBalance = Math.abs(myBalance) >= GROUP_DELETE_BALANCE_TOLERANCE;
  const hasOutstandingBalances = Object.values(balances).some(
    (balance) => Math.abs(balance) >= GROUP_DELETE_BALANCE_TOLERANCE
  );

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(group.inviteCode);
      } else {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = group.inviteCode;
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        document.execCommand('copy');
        temporaryInput.remove();
      }
      setCopiedKey('code');
      showToast('Invite code copied!');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast('Could not copy invite code.', 'error');
    }
  };

  const copyInviteLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = inviteUrl;
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        document.execCommand('copy');
        temporaryInput.remove();
      }
      setCopiedKey('link');
      showToast('Invite link copied!');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast('Could not copy the invite link.', 'error');
    }
  };

  const shareInviteLink = async () => {
    const title = `Join ${group.name} on Sharebills`;
    const text = `Join our shared group "${group.name}". Use code: ${group.inviteCode}`;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title,
          text,
          url: inviteUrl,
          dialogTitle: 'Share group invite',
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title,
          text,
          url: inviteUrl,
        });
      } else {
        await copyInviteLink();
      }
    } catch (error) {
      if (error.name !== 'AbortError') showToast('Could not share the invite link.', 'error');
    }
  };

  const handleSaveGroupName = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      showToast('Group name cannot be empty', 'error');
      return;
    }
    if (trimmed === group.name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      if (onUpdateGroup) {
        await onUpdateGroup({ ...group, name: trimmed });
      }
      showToast('Group name updated!');
      setIsEditingName(false);
    } catch (error) {
      showToast(error.message || 'Failed to rename group', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleGroupImageChange = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setSavingImage(true);
    try {
      const imageDataUrl = await compressImageFile(file);
      await onUpdateGroup({ ...group, imageDataUrl });
      showToast('Group image updated!');
    } catch (error) {
      showToast(error.message || 'Could not update group image.', 'error');
    } finally {
      setSavingImage(false);
    }
  };

  const handleRemoveGroupImage = async () => {
    setSavingImage(true);
    try {
      await onUpdateGroup({ ...group, imageDataUrl: '' });
      showToast('Group image removed.');
    } catch (error) {
      showToast(error.message || 'Could not update group image.', 'error');
    } finally {
      setSavingImage(false);
    }
  };

  const handleCurrencyChange = async (event) => {
    const currency = event.target.value;
    if (currency === (group.currency || 'INR')) return;
    setSavingCurrency(true);
    try {
      await onUpdateGroup({ ...group, currency });
      showToast(`Space currency changed to ${currency}.`);
    } catch (error) {
      showToast(error.message || 'Could not change the space currency.', 'error');
    } finally {
      setSavingCurrency(false);
    }
  };

  const handleExitGroup = async () => {
    if (hasMyOutstandingBalance) {
      showToast('Settle your balance before leaving the group.', 'error');
      return;
    }
    if (!onLeaveGroup) {
      showToast('Leaving this group is unavailable right now. Please try again.', 'error');
      return;
    }

    setLeaving(true);
    try {
      await onLeaveGroup(group.id, currentUser.id);
      showToast('You have left the group.');
    } catch (error) {
      showToast(error.message || 'Could not leave group', 'error');
      setConfirmingLeave(false);
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await onDeleteGroup(group);
    } catch (error) {
      showToast(error.message || 'Could not delete the group.', 'error');
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4 overflow-x-hidden p-4 pb-20 sm:p-6 lg:p-8">
      {/* Space Identity Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-1 min-w-0">
            <div className="w-12 h-12 overflow-hidden rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
              {group.imageDataUrl ? (
                <img src={group.imageDataUrl} alt="" className="h-full w-full object-cover" />
              ) : group.name ? (
                group.name.charAt(0).toUpperCase()
              ) : (
                <Layers size={20} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Space Settings
              </span>

              {isEditingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full text-sm font-bold border border-slate-300 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:border-slate-900 text-slate-900"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveGroupName}
                    disabled={savingName}
                    className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50"
                    title="Save"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewGroupName(group.name || '');
                      setIsEditingName(false);
                    }}
                    className="p-2 border border-slate-200 text-slate-500 bg-white rounded-xl hover:bg-slate-50"
                    title="Cancel"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                  {group.name || 'Untitled Group'}
                </h2>
              )}
            </div>
          </div>

          {!isEditingName && (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              title="Rename Space"
            >
              <Edit2 size={15} />
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <label
            className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ${
              savingImage ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-slate-50'
            }`}
          >
            <ImagePlus size={14} />
            {savingImage
              ? 'Saving…'
              : group.imageDataUrl
                ? 'Change image'
                : 'Add image'}
            <input
              type="file"
              accept="image/*"
              onChange={handleGroupImageChange}
              disabled={savingImage}
              className="sr-only"
            />
          </label>
          {group.imageDataUrl && (
            <button
              type="button"
              onClick={handleRemoveGroupImage}
              disabled={savingImage}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              Remove image
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
            <label htmlFor="space-currency" className="text-xs font-bold text-slate-800">
              Currency:
            </label>
            <select
              id="space-currency"
              value={group.currency || 'INR'}
              onChange={handleCurrencyChange}
              disabled={savingCurrency}
              aria-label="Space currency"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-blue-400 disabled:opacity-60 sm:w-56"
            >
              {GROUP_CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Invite Bar */}
      <button
        type="button"
        onClick={() => setIsInviteOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        <UserPlus size={14} />
        <span>Invite friends</span>
      </button>

      {/* Members List */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Users size={14} />
            <span>Room Members</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500">{group.members.length} total</span>
        </div>

        <div className="divide-y divide-slate-100">
          {group.members.map((memberId) => {
            const user = users.find((item) => item.id === memberId);
            const isMe = memberId === currentUser.id;
            const isGroupAdmin = memberId === group.createdBy;

            return (
              <div key={memberId} className="p-3.5 sm:p-4 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {user?.photoDataUrl ? (
                    <img
                      src={user.photoDataUrl}
                      alt={`${user.username} profile`}
                      className="h-9 w-9 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-xs">
                      {user ? user.username.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                      {user ? user.username : 'Unknown User'}
                      {isMe && (
                        <span className="text-xs text-emerald-700 font-semibold ml-1.5">(You)</span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {user?.email || 'Active roommate'}
                    </span>
                  </div>
                </div>

                {isGroupAdmin ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-900 text-white">
                    <Shield size={11} /> Admin
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                    Member
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <GroupRentPanel
        group={group}
        rentRecords={monthlyRents}
        currentUser={currentUser}
        users={users}
        onCreateRent={onCreateRent}
        onMarkRentPaid={onMarkRentPaid}
        onDeleteRent={onDeleteRent}
        showToast={showToast}
      />

      {/* Leave / Delete Space */}
      {!isAdmin ? (
        <div className="rounded-2xl p-4 bg-white border border-amber-200/80 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 border border-amber-200">
              <LogOut size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">Leave Space</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {hasMyOutstandingBalance
                  ? `Your balance is ₹${Math.abs(myBalance).toFixed(2)}. Settle all dues before leaving.`
                  : 'You are settled. Leaving removes you from this room.'}
              </p>
              {confirmingLeave ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingLeave(false)}
                    disabled={leaving}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExitGroup}
                    disabled={leaving}
                    className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                  >
                    {leaving ? 'Leaving...' : 'Confirm Exit'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (hasMyOutstandingBalance) {
                      showToast('Please settle all your balances before leaving the group.', 'error');
                      return;
                    }
                    setConfirmingLeave(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 text-white px-3.5 py-1.5 text-xs font-semibold"
                >
                  <LogOut size={13} />
                  <span>Leave group</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-4 bg-white border border-rose-200/80 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0 border border-rose-200">
              <AlertTriangle size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">Delete Space</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {hasOutstandingBalances
                  ? `Settle all balances of ${formatCurrency(1, group.currency)} or more before deleting this group.`
                  : 'All member balances are settled. Deleting permanently removes this space.'}
              </p>
              {confirmingDelete ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    className="rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Confirm delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (hasOutstandingBalances) {
                      showToast(
                        `Please settle all group balances of ${formatCurrency(1, group.currency)} or more before deleting this group.`,
                        'error'
                      );
                      return;
                    }
                    setConfirmingDelete(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 text-white px-3.5 py-1.5 text-xs font-semibold"
                >
                  <Trash2 size={13} />
                  <span>Delete group</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsInviteOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-5 bg-white border border-slate-200 shadow-xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Invite Roommates</h3>
                  <p className="text-xs text-slate-500">Share room code or invite link</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Room Code
                  </span>
                  <span className="font-mono text-lg font-bold tracking-widest text-slate-900">
                    {group.inviteCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 rounded-lg bg-white text-slate-900 border border-slate-200 text-xs font-semibold flex items-center gap-1"
                >
                  {copiedKey === 'code' ? (
                    <Check size={13} className="text-emerald-600" />
                  ) : (
                    <Copy size={13} />
                  )}
                  <span>{copiedKey === 'code' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <Link size={14} /> Copy Invite Link
                  </span>
                  {copiedKey === 'link' ? (
                    <span className="text-emerald-600 font-bold">Copied</span>
                  ) : (
                    <Copy size={13} className="text-slate-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={shareInviteLink}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <Share2 size={14} /> Share Invite Link
                  </span>
                  <Share2 size={13} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsInviteOpen(false);
                    setShowQrModal(true);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <QrCode size={14} /> Show QR Code
                  </span>
                  <QrCode size={13} className="text-slate-400" />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* QR Code Modal */}
      {showQrModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setShowQrModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xs rounded-2xl p-5 bg-white border border-slate-200 shadow-xl text-center"
            >
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X size={15} />
              </button>

              <h3 className="text-sm font-bold text-slate-900">Scan to Join {group.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">
                Point your camera at this QR code
              </p>

              <div className="p-3 bg-white rounded-xl border border-slate-200 inline-block mb-3">
                <QRCodeCanvas value={inviteUrl} size={168} level="H" includeMargin />
              </div>

              <div className="text-xs font-semibold text-slate-600 bg-slate-50 py-2 px-3 rounded-lg border border-slate-200">
                Code: <span className="font-mono font-bold text-slate-900">{group.inviteCode}</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}