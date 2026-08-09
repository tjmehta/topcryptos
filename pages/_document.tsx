import { Head, Html, Main, NextScript } from 'next/document'

// Body styling moved into styles/globals.css so Tailwind owns the theme
// instead of an inline style object that utilities could not override.
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
