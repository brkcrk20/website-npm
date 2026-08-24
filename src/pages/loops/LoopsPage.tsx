import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { loopService } from '../../services/loopService';
import { listingService } from '../../services/listingService';
import { CATEGORIES } from '../../constants';
import { CategoryId, Listing, Loop } from '../../types';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  Leaf,
  Loader2,
  Plus,
  Repeat,
  Users,
  X,
} from 'lucide-react';

/**
 * Takas Döngüleri (çoklu dairesel takas).
 *
 * A→B→C→A: kimse tam karşılığını bulamadığında üç kişi zincir kurar.
 * Bu ekran artık sadece göstermiyor; döngü açabiliyor, var olana
 * katılabiliyor ve kendi adımını onaylayabiliyorsun.
 */
export const LoopsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast, refreshScorecard } = useApp();

  const [loops, setLoops] = useState<Loop[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyLoopId, setBusyLoopId] = useState<string | null>(null);

  // Katılma / oluşturma akışı
  const [joinTarget, setJoinTarget] = useState<Loop | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newLoopTitle, setNewLoopTitle] = useState('');
  const [newLoopCategory, setNewLoopCategory] = useState<CategoryId>('electronics');
  const [newLoopSize, setNewLoopSize] = useState(3);
  const [selectedListingId, setSelectedListingId] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    const [allLoops, listings] = await Promise.all([
      loopService.getLoops(),
      listingService.getTradableUserListings(currentUser.id),
    ]);
    setLoops(allLoops);
    setMyListings(listings);
    setSelectedListingId((prev) => prev || listings[0]?.id || '');
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  const myLoops = loops.filter((loop) =>
    loop.participants.some((participant) => participant.userId === currentUser.id)
  );

  const openLoops = loops.filter(
    (loop) =>
      loop.status === 'matching' &&
      !loop.participants.some((participant) => participant.userId === currentUser.id) &&
      loop.participants.length < loop.totalParticipants
  );

  const handleCreateLoop = async () => {
    if (!newLoopTitle.trim() || !selectedListingId) {
      showToast('Eksik bilgi', 'Döngü başlığı ve döngüye koyacağın ilan gerekli.', 'warning');
      return;
    }

    setBusyLoopId('new');
    const created = await loopService.createLoop(
      currentUser.id,
      selectedListingId,
      newLoopTitle.trim(),
      newLoopCategory,
      newLoopSize
    );
    setBusyLoopId(null);

    if (!created) {
      showToast('Döngü açılamadı', 'Lütfen tekrar deneyin.', 'error');
      return;
    }

    setIsCreating(false);
    setNewLoopTitle('');
    showToast('Döngü açıldı 🔁', `${newLoopSize} kişilik döngün katılımcı bekliyor.`, 'success');
    await load();
  };

  const handleJoinLoop = async () => {
    if (!joinTarget || !selectedListingId) return;

    setBusyLoopId(joinTarget.id);
    const updated = await loopService.joinLoop(joinTarget.id, currentUser.id, selectedListingId);
    setBusyLoopId(null);

    if (!updated) {
      showToast('Katılınamadı', 'Döngüye katılırken bir sorun oluştu.', 'error');
      return;
    }

    setJoinTarget(null);
    showToast('Döngüye katıldın', 'Döngü dolduğunda teslimat adımı başlayacak.', 'success');
    await load();
  };

  const handleConfirmStep = async (loop: Loop) => {
    setBusyLoopId(loop.id);
    const updated = await loopService.confirmParticipantStep(loop.id, currentUser.id);
    setBusyLoopId(null);

    if (!updated) {
      showToast('Onaylanamadı', 'Döngü adımın onaylanamadı, tekrar dene.', 'error');
      return;
    }

    showToast(
      'Adımın onaylandı',
      'Tüm katılımcılar onayladığında teslimat başlayacak.',
      'success'
    );
    refreshScorecard();
    await load();
  };

  const renderLoopCard = (loop: Loop, isMine: boolean) => {
    const me = loop.participants.find((participant) => participant.userId === currentUser.id);

    return (
      <article
        key={loop.id}
        className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">
              {loop.status === 'matching'
                ? 'Katılımcı aranıyor'
                : loop.status === 'locked'
                  ? 'Döngü kilitlendi'
                  : loop.status === 'in_delivery'
                    ? 'Teslimat aşaması'
                    : loop.status === 'completed'
                      ? 'Tamamlandı'
                      : 'İptal edildi'}
            </span>
            <h3 className="text-sm font-bold mt-1 truncate">{loop.title}</h3>
          </div>

          <span className="text-[11px] font-bold text-stone-500 flex items-center gap-1 shrink-0">
            <Users className="w-3.5 h-3.5" />
            {loop.participants.length}/{loop.totalParticipants}
          </span>
        </div>

        {loop.participants.length > 0 && (
          <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/50 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
              Kim kime ne veriyor?
            </span>

            {loop.participants.map((participant) => {
              const receiver = loop.participants.find(
                (item) => item.userId === participant.givesToUserId
              );
              const isMe = participant.userId === currentUser.id;

              return (
                <div
                  key={participant.userId}
                  className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    isMe
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
                  }`}
                >
                  <img
                    src={participant.user.avatarUrl}
                    alt={participant.user.fullName}
                    className="w-7 h-7 rounded-full object-cover shrink-0 bg-stone-100"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-bold block truncate">
                      {participant.user.fullName}
                      {isMe && ' (Sen)'}
                    </span>
                    <span className="text-[10px] text-stone-500 dark:text-stone-400 block truncate">
                      {participant.offeringListing.title}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="text-[11px] font-semibold truncate max-w-[70px] text-right">
                    {receiver?.user.fullName ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-900 to-teal-900 text-white flex items-center gap-2">
          <Leaf className="w-4 h-4 text-emerald-300 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] text-emerald-200 block">Döngünün toplam tasarrufu</span>
            <span className="text-xs font-extrabold">
              +{loop.totalImpact.co2eKg} kg CO₂e · +{loop.totalImpact.waterLiters} L su
            </span>
          </div>
        </div>

        {isMine ? (
          <button
            type="button"
            disabled={busyLoopId === loop.id || me?.hasConfirmed || loop.status === 'completed'}
            onClick={() => handleConfirmStep(loop)}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {busyLoopId === loop.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {me?.hasConfirmed ? 'Adımını onayladın' : 'Katılımımı ve eşyamı onayla'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setJoinTarget(loop)}
            disabled={!myListings.length}
            className="w-full py-3 bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white rounded-2xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {myListings.length ? 'Bu döngüye katıl' : 'Katılmak için önce ilan ver'}
          </button>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Takas Döngüleri</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Karşılıklı takas tutmadığında zincir kur
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-900 dark:text-emerald-200 leading-relaxed">
            <strong className="font-bold">Döngü nasıl çalışır?</strong> Sen A'ya, A B'ye, B sana
            verir. Kimse tam eşleşme bulamasa bile herkes istediği eşyayı alır. Herkes onayladığında
            teslimat adımı açılır.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating((prev) => !prev)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
        >
          {isCreating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isCreating ? 'Vazgeç' : 'Yeni döngü başlat'}
        </button>

        {isCreating && (
          <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-4 space-y-3">
            <div>
              <label htmlFor="loop-title" className="block text-xs font-bold mb-1.5">
                Döngü başlığı
              </label>
              <input
                id="loop-title"
                value={newLoopTitle}
                maxLength={60}
                onChange={(e) => setNewLoopTitle(e.target.value)}
                placeholder="Örn: Elektronik 3'lü döngü"
                className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="loop-category" className="block text-xs font-bold mb-1.5">
                  Kategori
                </label>
                <select
                  id="loop-category"
                  value={newLoopCategory}
                  onChange={(e) => setNewLoopCategory(e.target.value as CategoryId)}
                  className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-hidden text-sm"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="loop-size" className="block text-xs font-bold mb-1.5">
                  Kişi sayısı
                </label>
                <select
                  id="loop-size"
                  value={newLoopSize}
                  onChange={(e) => setNewLoopSize(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-hidden text-sm"
                >
                  {[3, 4, 5].map((size) => (
                    <option key={size} value={size}>
                      {size} kişi
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="loop-listing" className="block text-xs font-bold mb-1.5">
                Döngüye koyacağın ilan
              </label>
              {myListings.length ? (
                <select
                  id="loop-listing"
                  value={selectedListingId}
                  onChange={(e) => setSelectedListingId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-hidden text-sm"
                >
                  {myListings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.title}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/ilan-ver')}
                  className="w-full py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer"
                >
                  Önce bir ilan ver
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCreateLoop}
              disabled={busyLoopId === 'new' || !myListings.length}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {busyLoopId === 'new' ? 'Açılıyor...' : 'Döngüyü başlat'}
            </button>
          </section>
        )}

        {isLoading && <p className="text-center text-xs text-stone-400 py-8">Yükleniyor...</p>}

        {!isLoading && (
          <>
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Döngülerim ({myLoops.length})
              </h2>

              {myLoops.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-stone-400 text-center py-6">
                  Henüz bir döngüde değilsin.
                </p>
              ) : (
                myLoops.map((loop) => renderLoopCard(loop, true))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Katılabileceğin döngüler ({openLoops.length})
              </h2>

              {openLoops.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-stone-400 text-center py-6">
                  Şu anda açık döngü yok. İlk döngüyü sen başlatabilirsin.
                </p>
              ) : (
                openLoops.map((loop) => renderLoopCard(loop, false))
              )}
            </section>
          </>
        )}
      </div>

      {/* Katılma onayı */}
      {joinTarget && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Repeat className="w-4 h-4 text-emerald-700" />
                Döngüye katıl
              </h3>
              <button
                type="button"
                onClick={() => setJoinTarget(null)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-500 dark:text-stone-400">
              <strong className="text-stone-900 dark:text-stone-100">{joinTarget.title}</strong>{' '}
              döngüsüne hangi ilanınla katılıyorsun?
            </p>

            <select
              value={selectedListingId}
              onChange={(e) => setSelectedListingId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-hidden text-sm"
            >
              {myListings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleJoinLoop}
              disabled={busyLoopId === joinTarget.id}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {busyLoopId === joinTarget.id ? 'Katılıyor...' : 'Döngüye katıl'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
