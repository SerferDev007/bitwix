Team photos served from the site root (Vite copies Frontend/public/ into dist/).

Drop the file here with EXACTLY this name so the website picks it up:

  amruta-shejul.jpg         ->  shown on Amruta Shejul's team card
  sarita-palakudetwar.jpg   ->  shown on Sarita Palakudetwar's team card

The component references it as "/team/amruta-shejul.jpg" (see
src/app/components/Team.tsx, LOCAL_PHOTOS). If the file is missing the card
degrades to a placeholder; once the file is present and the site is rebuilt/
deployed, the photo appears automatically.

Guidelines: JPG, roughly square or portrait, ~600-1000px, optimized (< ~300 KB).
To add another person, save their photo here and add a
"full name (lowercase)": "/team/<file>.jpg" entry to LOCAL_PHOTOS.
