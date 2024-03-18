CREATE TEMP TABLE temp_remote_instances (host TEXT);
INSERT INTO temp_remote_instances VALUES
    ('remote.example.com'),
    ('another.example.com')
;

SELECT
    CASE WHEN f1.host is null
        THEN f1.username
        ELSE CONCAT(f1.username, '@', f1.host)
    END as follower,
    CASE WHEN f2.host is null
        THEN f2.username
        ELSE CONCAT(f2.username, '@', f2.host)
    END as followee
FROM following
JOIN temp_remote_instances ri ON
    "followerHost" = ri.host
    OR "followeeHost" = ri.host
JOIN "user" f1 ON f1.id = "followerId"
JOIN "user" f2 ON f2.id = "followeeId"
ORDER BY
    follower,
    followee;

DROP TABLE temp_remote_instances;
