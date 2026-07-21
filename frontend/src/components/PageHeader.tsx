import React from "react";
import { pagesetter } from "../App";
import { getcolorstring } from "../Homepage";

const HOME_BUTTON_URL =
  "https://i.ibb.co/9nchptY/Screenshot-2024-01-14-at-3-00-09-PM.png";

type PageHeaderProps = {
  title: string;
  setPage: pagesetter;
  hue?: number;
};

export const PageHeader: React.FC<PageHeaderProps> = ({ title, setPage, hue = 220 }) => {
  const background = getcolorstring({ h: hue, s: 0.6, v: 1 });

  return (
    <header className="page-header" style={{ backgroundColor: background }}>
      <button type="button" className="page-header__home" onClick={() => setPage(0)} aria-label="Home">
        <img src={HOME_BUTTON_URL} alt="" width={100} height={50} />
      </button>
      <h1 className="page-header__title">{title}</h1>
    </header>
  );
};
