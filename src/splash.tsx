import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-800 to-slate-900">
			<h1 className="text-3xl font-bold text-white">Alchemy Game</h1>
			<div className="flex gap-2">
				<span className="rounded-lg bg-sky-200 border-2 border-sky-400 px-3 py-1 text-sm">Air</span>
				<span className="rounded-lg bg-orange-300 border-2 border-orange-500 px-3 py-1 text-sm">Fire</span>
				<span className="rounded-lg bg-amber-600 border-2 border-amber-800 px-3 py-1 text-sm">Earth</span>
				<span className="rounded-lg bg-blue-400 border-2 border-blue-600 px-3 py-1 text-sm">Water</span>
			</div>
			<p className="text-slate-400 text-sm">Combine elements to discover new ones</p>
			<button
				className="mt-4 cursor-pointer rounded-full bg-[#d93900] px-6 py-3 text-white font-medium transition-colors hover:bg-[#ff4500]"
				onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
			>
				Play Now
			</button>
		</div>
	);
};

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Splash />
	</StrictMode>
);
