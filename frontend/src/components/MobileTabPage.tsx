import React, { useState } from "react";
import { pagesetter } from "../App";
import { TabDescription } from "./TabDescription";
import { PageHeader } from "./PageHeader";

type TabEntry = {
  title: string;
  imageurl: string;
  imdms: { x: number; y: number };
  description: string[];
};

type MobileTabPageProps = {
  title: string;
  setPage: pagesetter;
  tabs: TabEntry[];
  hue?: number;
  renderContent: (tab: TabEntry, tabIndex: number) => React.ReactNode;
};

export const MobileTabPage: React.FC<MobileTabPageProps> = ({
  title,
  setPage,
  tabs,
  hue,
  renderContent,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const tab = tabs[activeTab];

  return (
    <div className="mobile-page">
      <PageHeader title={title} setPage={setPage} hue={hue} />
      <div className="mobile-tab-bar" role="tablist" aria-label={`${title} sections`}>
        {tabs.map((entry, index) => (
          <button
            key={entry.title}
            type="button"
            role="tab"
            aria-selected={index === activeTab}
            className={`mobile-tab-button${index === activeTab ? " is-active" : ""}`}
            onClick={() => setActiveTab(index)}
          >
            {entry.title}
          </button>
        ))}
      </div>
      <div className="mobile-panel" role="tabpanel">
        <h2 className="mobile-panel__title">{tab.title}</h2>
        <TabDescription lines={tab.description} className="mobile-panel__description" />
        {renderContent(tab, activeTab)}
      </div>
    </div>
  );
};
