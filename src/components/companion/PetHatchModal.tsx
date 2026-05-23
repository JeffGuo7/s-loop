import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePetStore } from '../../stores';
import { generatePetAppearance, getSpeciesEmoji, getHatEmoji } from '../../utils';
import { Sparkles, Heart } from 'lucide-react';
import { MagicButton } from '../ui';

interface PetHatchModalProps {
  onClose: () => void;
}

export function PetHatchModal({ onClose }: PetHatchModalProps) {
  const { t } = useTranslation();
  const { hatchPet } = usePetStore();
  const [step, setStep] = useState<'name' | 'preview' | 'done'>('name');
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [previewSeed, setPreviewSeed] = useState('');

  const handlePreview = () => {
    if (!name.trim()) return;
    setPreviewSeed(`preview-${Date.now()}`);
    setStep('preview');
  };

  const handleHatch = () => {
    hatchPet(name.trim(), personality.trim() || 'A friendly companion');
    setStep('done');
  };

  const handleReroll = () => {
    setPreviewSeed(`preview-${Date.now()}`);
  };

  const preview = previewSeed ? generatePetAppearance(previewSeed) : null;

  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm p-6 bg-[var(--color-surface)] rounded-xl shadow-2xl text-center">
          <Sparkles size={48} className="mx-auto mb-4 text-[var(--color-accent)] animate-pulse" />
          <h2 className="text-2xl font-bold mb-2">{t('pet.welcome', {name})}</h2>
          <p className="text-[var(--color-text-secondary)] mb-4">
            {t('pet.hatchedDesc')}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
          >
            {t('pet.startAdventure')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 bg-[var(--color-surface)] rounded-xl shadow-2xl">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Sparkles size={24} className="text-[var(--color-accent)]" />
          {t('pet.hatchTitle')}
        </h2>

        {step === 'name' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('pet.name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('pet.namePlaceholder')}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('pet.personality')} <span className="text-[var(--color-text-secondary)]">{t('pet.optional')}</span>
              </label>
              <input
                type="text"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder={t('pet.personalityPlaceholder')}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
                maxLength={50}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors"
              >
                {t('pet.cancel')}
              </button>
              <button
                onClick={handlePreview}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {t('pet.continue')}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* Preview Card */}
            <div className="p-4 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)]">
              <div className="flex items-center gap-4">
                {/* Pet Visual */}
                <div className="relative">
                  {preview.shiny && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-300 via-pink-300 to-cyan-300 opacity-50 animate-spin-slow blur-sm" />
                  )}
                  <div
                    className="relative w-20 h-20 rounded-full flex items-center justify-center bg-[var(--color-surface)] border-2"
                    style={{
                      borderColor: preview.shiny ? '#F59E0B' : 'var(--color-border)',
                    }}
                  >
                    {preview.hat !== 'none' && (
                      <div className="absolute -top-3 text-xl">{getHatEmoji(preview.hat)}</div>
                    )}
                    <span className="text-4xl">{getSpeciesEmoji(preview.species)}</span>
                  </div>
                </div>

                {/* Pet Info */}
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{name}</h3>
                  <p
                    className="text-sm capitalize"
                    style={{ color: preview.shiny ? '#F59E0B' : 'var(--color-text-secondary)' }}
                  >
                    {preview.shiny && t('pet.shiny') + ' '}
                    {preview.rarity} {preview.species}
                  </p>
                  {personality && (
                    <p className="text-xs text-[var(--color-text-secondary)] italic mt-1">
                      "{personality}"
                    </p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {Object.entries(preview.stats).map(([stat, value]) => (
                  <div key={stat} className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-secondary)]">{stat}</span>
                    <div className="flex-1 h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${value}%`,
                          backgroundColor: 'var(--color-accent)',
                        }}
                      />
                    </div>
                    <span className="text-xs">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-between">
              <button
                onClick={() => setStep('name')}
                className="px-4 py-2 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors"
              >
                {t('pet.back')}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleReroll}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-secondary)] transition-colors flex items-center gap-1"
                >
                  <Sparkles size={16} />
                  {t('pet.reroll')}
                </button>
                <MagicButton
                  onClick={handleHatch}
                  className="flex items-center gap-1"
                >
                  <Heart size={16} />
                  {t('pet.hatchBtn')}
                </MagicButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}