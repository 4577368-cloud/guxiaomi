/**
 * 紫微命盘 4×4 网格（玄枢 ZiweiChartView，浅色主题 — 传统命盘纸质观感）
 */
function getZiweiBranchCenters() {
  if (window.ZiweiConstants && window.ZiweiConstants.BRANCH_CENTERS) {
    return window.ZiweiConstants.BRANCH_CENTERS;
  }
  return {
    0: { x: 62.5, y: 87.5 }, 1: { x: 37.5, y: 87.5 }, 2: { x: 12.5, y: 87.5 },
    3: { x: 12.5, y: 62.5 }, 4: { x: 12.5, y: 37.5 }, 5: { x: 12.5, y: 12.5 },
    6: { x: 37.5, y: 12.5 }, 7: { x: 62.5, y: 12.5 }, 8: { x: 87.5, y: 12.5 },
    9: { x: 87.5, y: 37.5 }, 10: { x: 87.5, y: 62.5 }, 11: { x: 87.5, y: 87.5 },
  };
}

function ziweiStarColor(type, isDarkBg) {
  if (isDarkBg) {
    if (type === 'major') return 'text-amber-300';
    if (type === 'lucky') return 'text-emerald-300';
    if (type === 'bad') return 'text-rose-300';
    return 'text-stone-300';
  }
  if (type === 'major') return 'text-red-700';
  if (type === 'lucky') return 'text-emerald-700';
  if (type === 'bad') return 'text-stone-500';
  return 'text-slate-500';
}

function ziweiBrightnessColor(b, isDarkBg) {
  if (!b) return isDarkBg ? 'text-white/20' : 'text-stone-300';
  if (b === '庙' || b === '旺') return isDarkBg ? 'text-amber-400' : 'text-red-600';
  return isDarkBg ? 'text-stone-400' : 'text-stone-500';
}

function ziweiFormatBrightness(b) {
  if (b === '得地') return '得';
  if (b === '利益') return '利';
  return b;
}

function ziweiHuaBg(hua) {
  if (hua === '禄') return 'bg-emerald-600';
  if (hua === '权') return 'bg-red-600';
  if (hua === '科') return 'bg-blue-600';
  if (hua === '忌') return 'bg-stone-800';
  return 'bg-stone-400';
}

function ZiweiVerticalStar({ name, type, brightness, hua, isDarkBg, isFlow }) {
  return (
    <div className="flex flex-col items-center relative group shrink-0 mb-1 sm:mb-1.5 px-px sm:px-0.5">
      {hua && (
        <span
          className={
            'absolute -left-1.5 sm:-left-2 -top-0.5 sm:-top-1 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full flex items-center justify-center text-[6px] sm:text-[8px] text-white font-bold shadow-sm ring-1 ring-white z-20 ' +
            ziweiHuaBg(hua)
          }
        >
          {hua}
        </span>
      )}
      {isFlow && (
        <span className="absolute -right-1.5 sm:-right-2 -top-0.5 sm:-top-1 px-px sm:px-0.5 py-px rounded-sm text-[6px] sm:text-[8px] font-bold z-20 bg-purple-600 text-white ring-1 ring-white/60">
          流
        </span>
      )}
      <div
        className={
          'flex flex-col items-center leading-[1.05] sm:leading-[1.1] font-black tracking-tighter ' +
          (type === 'major' ? 'text-[10px] sm:text-[12px] md:text-[14px]' : 'text-[8px] sm:text-[10px] md:text-[11px]') +
          ' ' +
          ziweiStarColor(type, isDarkBg)
        }
      >
        {name.split('').map(function (char, i) {
          return <span key={i}>{char}</span>;
        })}
      </div>
      {brightness && (
        <span className={'text-[7px] sm:text-[9px] font-bold mt-px sm:mt-0.5 ' + ziweiBrightnessColor(brightness, isDarkBg)}>
          {ziweiFormatBrightness(brightness)}
        </span>
      )}
    </div>
  );
}

function ziweiChunkStars(stars, size) {
  var chunkSize = size || 3;
  var result = [];
  for (var i = 0; i < stars.length; i += chunkSize) {
    result.push(stars.slice(i, i + chunkSize));
  }
  return result;
}

function ZiweiChartView({ chartData, profile, activePalaceName, analysisPalaceName, onPalaceClick, onPalaceAnalyze }) {
  if (!chartData || !chartData.palaces || !chartData.gridMapping) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
        命盘计算失败，请检查出生日期是否完整
      </div>
    );
  }

  var BRANCH_CENTERS = getZiweiBranchCenters();
  var activePalace = chartData.palaces.find(function (p) {
    return p.name === activePalaceName;
  });

  function getRelationType(targetZhiIndex) {
    if (!activePalace) return null;
    var activeIdx = activePalace.zhiIndex;
    if (targetZhiIndex === activeIdx) return 'self';
    if ((activeIdx + 6) % 12 === targetZhiIndex) return 'opposite';
    if ((activeIdx + 4) % 12 === targetZhiIndex || (activeIdx + 8) % 12 === targetZhiIndex) return 'trine';
    return null;
  }

  var displayName = (profile && profile.name) || '命主';
  var genderLabel = profile && profile.gender === 'female' ? '女' : '男';

  return (
    <div className="w-full max-w-full overflow-hidden shrink-0 select-none touch-pan-x bg-white p-1 sm:p-2 rounded-lg">
      <div className="grid grid-cols-4 grid-rows-4 gap-px bg-stone-200 border border-stone-200 shadow-md relative aspect-[4/5.4] sm:aspect-[4/4.8] w-full max-w-md sm:max-w-none mx-auto overflow-hidden rounded-xl">
        {activePalace && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-40" viewBox="0 0 100 100" preserveAspectRatio="none">
            {(function () {
              var i = activePalace.zhiIndex;
              var pSelf = BRANCH_CENTERS[i];
              var pWealth = BRANCH_CENTERS[(i + 4) % 12];
              var pCareer = BRANCH_CENTERS[(i + 8) % 12];
              var pTravel = BRANCH_CENTERS[(i + 6) % 12];
              return (
                <React.Fragment>
                  <path
                    d={'M ' + pSelf.x + ' ' + pSelf.y + ' L ' + pWealth.x + ' ' + pWealth.y + ' L ' + pCareer.x + ' ' + pCareer.y + ' Z'}
                    fill="rgba(79, 70, 229, 0.06)"
                    stroke="rgba(79, 70, 229, 0.4)"
                    strokeWidth="0.12"
                    strokeDasharray="1,1"
                  />
                  <line
                    x1={pSelf.x}
                    y1={pSelf.y}
                    x2={pTravel.x}
                    y2={pTravel.y}
                    stroke="rgba(147, 51, 234, 0.5)"
                    strokeWidth="0.08"
                    strokeDasharray="2,1"
                  />
                </React.Fragment>
              );
            })()}
          </svg>
        )}

        {chartData.gridMapping.map(function (branchIndex, gridIdx) {
          if (branchIndex === null) {
            if (gridIdx === 5) {
              return (
                <div
                  key="center"
                  className="col-span-2 row-span-2 bg-white flex flex-col items-center p-1.5 sm:p-4 relative z-20 overflow-hidden border-2 border-stone-100 rounded-lg shadow-inner m-0.5 sm:m-1"
                >
                  <div className="flex gap-1.5 sm:gap-4 text-[10px] sm:text-[13px] font-black text-stone-700 mb-1 sm:mb-2">
                    {(chartData.baZi || []).map(function (bz, i) {
                      return (
                        <span key={i} className="font-serif border-b border-stone-200">
                          {bz}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between w-full px-2 mb-2 border-b border-stone-100 pb-1 shrink-0">
                    <span className="text-sm sm:text-base font-black text-indigo-950 font-serif">
                      {chartData.bureau && chartData.bureau.name}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-stone-400 font-bold">
                      {displayName} · {genderLabel}
                    </span>
                  </div>
                  <div className="w-full flex-1 overflow-y-auto no-scrollbar pt-1 text-left space-y-2">
                    {(chartData.patterns || []).map(function (pat, idx) {
                      return (
                        <div key={idx} className="border-l-2 border-indigo-200 pl-2 py-0.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className={
                                'text-[8px] px-1 py-0.5 rounded-sm text-white font-bold shrink-0 ' +
                                (pat.type && pat.type.indexOf('吉') >= 0 ? 'bg-emerald-600' : 'bg-indigo-600')
                              }
                            >
                              {pat.type ? pat.type.charAt(0) : '格'}
                            </span>
                            <span className="text-[10px] sm:text-[11px] font-black text-stone-800 font-serif">
                              {pat.name}
                            </span>
                          </div>
                          <p className="text-[9px] leading-tight text-stone-500 text-justify">{pat.description}</p>
                        </div>
                      );
                    })}
                    {(!chartData.patterns || chartData.patterns.length === 0) && (
                      <div className="h-full flex items-center justify-center text-[10px] text-stone-300 italic">
                        暂无特殊格局
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          }

          var palace = chartData.palaces[branchIndex];
          var relation = getRelationType(palace.zhiIndex);
          var isActive = relation === 'self';
          var isAnalyzed = analysisPalaceName === palace.name;

          var bgClass = 'bg-white hover:bg-stone-50';
          if (relation === 'self') {
            bgClass = 'bg-indigo-900 ring-2 ring-inset ring-amber-400 z-30 shadow-lg';
          } else if (relation === 'opposite') {
            bgClass = 'bg-purple-100/70 ring-1 ring-inset ring-purple-200';
          } else if (relation === 'trine') {
            bgClass = 'bg-sky-100/70 ring-1 ring-inset ring-sky-200';
          }
          if (isAnalyzed) {
            bgClass += ' ring-2 ring-amber-400/70 ring-inset';
          }

          var majorChunks = ziweiChunkStars(palace.stars.major, 3);
          var minorChunks = ziweiChunkStars(palace.stars.minor, 3);

          return (
            <div
              key={gridIdx}
              onClick={function () {
                if (onPalaceClick) onPalaceClick(palace.name);
              }}
              className={'relative overflow-hidden cursor-pointer transition-all duration-300 ' + bgClass}
            >
              <div className="absolute top-1 sm:top-2 right-1 sm:right-1.5 bottom-7 sm:bottom-10 left-1 sm:left-1.5 flex flex-row-reverse items-start justify-start gap-x-1 sm:gap-x-3.5 md:gap-x-5 z-20 overflow-x-auto overflow-y-hidden no-scrollbar pt-0.5 sm:pt-1 pl-1 sm:pl-2">
                {majorChunks.map(function (chunk, cIdx) {
                  return (
                    <div key={'maj-' + cIdx} className="flex flex-col items-center shrink-0">
                      {chunk.map(function (s, i) {
                        return (
                          <ZiweiVerticalStar
                            key={i}
                            name={s.name}
                            type="major"
                            brightness={s.brightness}
                            hua={s.hua}
                            isDarkBg={isActive}
                            isFlow={s.isFlow}
                          />
                        );
                      })}
                    </div>
                  );
                })}
                {minorChunks.map(function (chunk, cIdx) {
                  return (
                    <div
                      key={'min-' + cIdx}
                      className={'flex flex-col items-center shrink-0 pt-0.5 ' + (cIdx > 0 ? 'opacity-60 scale-90' : '')}
                    >
                      {chunk.map(function (s, i) {
                        return (
                          <ZiweiVerticalStar
                            key={i}
                            name={s.name}
                            type={s.type}
                            brightness={s.brightness}
                            hua={s.hua}
                            isDarkBg={isActive}
                            isFlow={s.isFlow}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div
                className={
                  'absolute bottom-0 left-0 right-0 h-7 sm:h-9 z-10 flex items-center justify-center pointer-events-none bg-gradient-to-t ' +
                  (isActive ? 'from-indigo-900 via-indigo-900/90' : 'from-white via-white/95') +
                  ' to-transparent'
                }
              >
                <span
                  className={
                    'absolute left-1 sm:left-1.5 text-[9px] sm:text-[11px] font-serif font-black ' +
                    (isActive ? 'text-amber-100/80' : 'text-stone-500 opacity-80')
                  }
                >
                  {palace.stem}
                  {palace.zhi}
                </span>
                <div className="flex items-center justify-center gap-1 sm:gap-1.5 pointer-events-auto">
                  <span
                    className={
                      'text-[10px] sm:text-[12px] font-black transition-all duration-300 ' +
                      (isActive ? 'text-amber-300 sm:scale-105 tracking-wide' : 'text-red-800 opacity-90')
                    }
                  >
                    {palace.name}
                  </span>
                  {onPalaceAnalyze && (
                    <button
                      type="button"
                      title={'解析' + palace.name}
                      onClick={function (e) {
                        e.stopPropagation();
                        onPalaceAnalyze(palace.name);
                      }}
                      className={
                        'text-[10px] sm:text-[12px] font-black transition-all duration-300 shrink-0 ' +
                        (isActive
                          ? 'text-amber-200 hover:text-white underline decoration-amber-400/60 underline-offset-2'
                          : 'text-red-700/80 hover:text-indigo-800 underline decoration-stone-300 underline-offset-2')
                      }
                    >
                      解析
                    </button>
                  )}
                </div>
                <span
                  className={
                    'absolute right-1 sm:right-1.5 text-[6px] sm:text-[8px] font-sans font-bold tabular-nums ' +
                    (isActive ? 'text-white/50' : 'text-stone-400')
                  }
                >
                  {palace.daXian}
                </span>
              </div>

              <div
                className={
                  'absolute bottom-0.5 sm:bottom-1 left-1 sm:left-1.5 text-[7px] sm:text-[8px] font-bold pointer-events-none uppercase ' +
                  (isActive ? 'text-white/20' : 'text-stone-300')
                }
              >
                {palace.changSheng}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
