// Seeds virtual agents, today's handled work, and a fresh set of inbound Voice, Messaging, and Case work.
// Safe to rerun; pass true to clear open work items first.
System.debug(LoggingLevel.ERROR, 'SLK_INSTALL::' + JSON.serialize(SLK_ConsoleSeed.run(false)));
