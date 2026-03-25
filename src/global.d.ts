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

interface GlobalThis {
  __BUILD_NUMBER__: string;
}

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'emoji-picker': import('react').DetailedHTMLProps<
        import('react').HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        class?: string;
        dataSource?: string;
      };
    }
  }
}
