from PythonSimpleFunctions import EasySQL


db = EasySQL()
print(db.get_table_values("AcciTrack", "AcciTrack_ReportList"))
print(len(db.get_table_values("AcciTrack", "AcciTrack_ReportList")))
