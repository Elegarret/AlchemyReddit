const REACTION_CLUSTER_BASE_RADIUS = 50;
const REACTION_CLUSTER_MIN_ITEM_SPACING = 84;

const getReactionClusterRadius = (count: number) => {
	if (count <= 1) {
		return 0;
	}

	return Math.max(
		REACTION_CLUSTER_BASE_RADIUS,
		(count * REACTION_CLUSTER_MIN_ITEM_SPACING) / (Math.PI * 2)
	);
};

export const getReactionClusterPositions = (
	centerX: number,
	centerY: number,
	count: number
) => {
	if (count <= 0) {
		return [];
	}

	if (count === 1) {
		return [{ x: centerX, y: centerY }];
	}

	const radius = getReactionClusterRadius(count);

	return Array.from({ length: count }, (_, index) => {
		const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
		return {
			x: centerX + Math.cos(angle) * radius,
			y: centerY + Math.sin(angle) * radius,
		};
	});
};
