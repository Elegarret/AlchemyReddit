export type RealmSizeLabel =
  | 'empty'
  | 'tiny'
  | 'small'
  | 'medium'
  | 'big'
  | 'huge'
  | 'mega';

export const getRealmSizeLabel = (
  reactionCount: number
): RealmSizeLabel => {
  if (reactionCount <= 5) {
    return 'empty';
  }

  if (reactionCount <= 10) {
    return 'tiny';
  }

  if (reactionCount <= 30) {
    return 'small';
  }

  if (reactionCount <= 50) {
    return 'medium';
  }

  if (reactionCount <= 100) {
    return 'big';
  }

  if (reactionCount <= 200) {
    return 'huge';
  }

  return 'mega';
};

export const getRealmSizeTooltip = (reactionCount: number) =>
  `Realm size: ${reactionCount} reactions`;

export const isEmptyRealmSizeLabel = (label: RealmSizeLabel) =>
  label === 'empty';
