import React from "react";
import "./LiveScoreCard.css";
import ProgressPill from "./ProgressPill";

const LiveScoreCard = ({ match }) => {
  const { utcDate, homeTeam, awayTeam, score } = match;

  // Форматирование даты и времени
  const matchDate = new Date(utcDate);
  const formattedDate = matchDate.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
  const formattedTime = matchDate.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Проверяем, есть ли результат матча
  const homeScore = score.fullTime.home;
  const awayScore = score.fullTime.away;
  const isMatchPlayed = homeScore !== null && awayScore !== null;

  // Определяем победителя
  const getTeamClass = (teamType) => {
    if (!isMatchPlayed) return "team-name"; // Матч еще не начался
    if (teamType === "home" && homeScore > awayScore) return "team-name winner";
    if (teamType === "away" && awayScore > homeScore) return "team-name winner";
    return "team-name"; // Ничья или проигравшая команда
  };

  const getProgress = () => {
    if (match.status === "FINISHED") return 100;
    if (match.status === "IN_PLAY" || match.status === "PAUSED") return 55;
    return 5;
  };

  const renderTeamLogo = (team) => {
    if (team?.crest) {
      return (
        <img
          src={team.crest}
          alt={team.name}
          className="team-logo"
        />
      );
    }

    return (
      <div className="team-logo" style={{ display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}>
        {(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()}
      </div>
    );
  };

  return (
    <div className="live-score-card">
      <div className="match-date-time">
        <span>{formattedDate}</span>
        <span>{formattedTime}</span>
      </div>
      <div className="teams-container">
        <div className="team">
          {renderTeamLogo(homeTeam)}
          <span className={getTeamClass("home")}>
            {homeTeam.shortName || homeTeam.name}
          </span>
          <span className="team-score">
            {isMatchPlayed ? homeScore : "-"}
          </span>
        </div>

        <div className="team">
          {renderTeamLogo(awayTeam)}
          <span className={getTeamClass("away")}>
            {awayTeam.shortName || awayTeam.name}
          </span>
          <span className="team-score">
            {isMatchPlayed ? awayScore : "-"}
          </span>
        </div>
        <ProgressPill value={getProgress()} />
      </div>
    </div>
  );
};

export default LiveScoreCard;