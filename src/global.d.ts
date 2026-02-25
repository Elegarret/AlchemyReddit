declare module '*.css';

declare module '*.png' {
	const content: string;
	export default content;
}

declare module '*.jpg' {
	const content: string;
	export default content;
}

declare const __BUILD_NUMBER__: string;
