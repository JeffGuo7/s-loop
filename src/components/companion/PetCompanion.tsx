import { useState, useRef, useEffect } from 'react';
import { usePetStore } from '../../stores';
import { getSpeciesEmoji, getHatEmoji } from '../../utils';
import { X, Heart } from 'lucide-react';
import type { Pet } from '../../types/pet';

export function PetCompanion() {
  const { pet, showPet, petPosition, interactWithPet, updatePetMood, setPetPosition, setShowPet } = usePetStore();
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  useEffect(() => {
    // Random mood changes
    const interval = setInterval(() => {
      if (!pet) return;
      const moods: Pet['mood'][] = ['happy', 'neutral', 'sleepy'];
      const randomMood = moods[Math.floor(Math.random() * moods.length)];
      updatePetMood(randomMood);
    }, 30000);

    return () => clearInterval(interval);
  }, [pet, updatePetMood]);

  if (!pet || !showPet) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: petPosition.x,
      startPosY: petPosition.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setPetPosition({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragRef.current.startPosX + deltaX)),
        y: Math.max(0, Math.min(window.innerHeight - 80, dragRef.current.startPosY + deltaY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setPetPosition]);

  const getMoodAnimation = () => {
    switch (pet.mood) {
      case 'happy':
        return 'animate-bounce';
      case 'excited':
        return 'animate-pulse';
      case 'sleepy':
        return 'opacity-70';
      default:
        return '';
    }
  };

  return (
    <div
      className="fixed z-[9999] select-none"
      style={{ left: petPosition.x, top: petPosition.y }}
    >
      {/* Pet Container */}
      <div
        className={`relative cursor-move ${isDragging ? 'scale-110' : ''} transition-transform`}
        onMouseDown={handleMouseDown}
        onClick={() => {
          interactWithPet();
          setShowInfo(!showInfo);
        }}
      >
        {/* Shiny effect */}
        {pet.shiny && (
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-300 via-pink-300 to-cyan-300 opacity-50 animate-spin-slow blur-sm" />
        )}

        {/* Pet body */}
        <div
          className={`
            relative w-16 h-16 rounded-full flex items-center justify-center
            bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-dim)]
            border-2 border-[var(--color-border)] shadow-lg
            ${getMoodAnimation()}
            hover:scale-105 transition-transform
          `}
          style={{
            borderColor: pet.shiny ? '#F59E0B' : undefined,
            boxShadow: pet.shiny ? '0 0 20px rgba(245, 158, 11, 0.5)' : undefined,
          }}
        >
          {/* Hat */}
          {pet.hat !== 'none' && (
            <div className="absolute -top-3 text-lg">{getHatEmoji(pet.hat)}</div>
          )}

          {/* Main emoji */}
          <span className="text-3xl">{getSpeciesEmoji(pet.species)}</span>

          {/* Eyes overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs opacity-0">{pet.eye}</span>
          </div>

          {/* Rarity indicator */}
          <div
            className="absolute -bottom-1 text-[8px] font-bold"
            style={{ color: `var(--color-primary)` }}
          >
            {pet.rarity === 'legendary' && '✨'}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowPet(false);
          }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-error)] hover:text-white hover:border-[var(--color-error)] transition-colors"
        >
          <X size={10} />
        </button>
      </div>

      {/* Info popup */}
      {showInfo && (
        <div
          className="absolute left-20 top-0 w-48 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{getSpeciesEmoji(pet.species)}</span>
            <div>
              <h3 className="font-bold text-sm">{pet.name}</h3>
              <p
                className="text-xs"
                style={{ color: `var(--color-text-secondary)` }}
              >
                {pet.rarity} {pet.shiny && '✨ Shiny'}
              </p>
            </div>
          </div>

          <p className="text-xs text-[var(--color-text-secondary)] mb-2 italic">
            "{pet.personality}"
          </p>

          {/* Stats */}
          <div className="space-y-1">
            {Object.entries(pet.stats).map(([stat, value]) => (
              <div key={stat} className="flex items-center gap-2">
                <span className="text-[10px] w-16 text-[var(--color-text-secondary)]">
                  {stat}
                </span>
                <div className="flex-1 h-1.5 bg-[var(--color-surface-dim)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${value}%`,
                      backgroundColor: `var(--color-primary)`,
                    }}
                  />
                </div>
                <span className="text-[10px] w-6 text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Mood */}
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[var(--color-border)]">
            <Heart
              size={12}
              className={pet.mood === 'happy' ? 'text-[var(--color-error)] fill-red-500' : 'text-[var(--color-text-secondary)]'}
            />
            <span className="text-xs capitalize">{pet.mood}</span>
          </div>
        </div>
      )}
    </div>
  );
}