(() => {
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function createRemoteStore(){
const adapter=window.CDPRemote.adapter;
if(!adapter)throw Error("Supabase data has not loaded.");
const state=adapter.state;
const save=()=>adapter.save();
const nextId=()=>crypto.randomUUID();
    function meetingDay(now = new Date()) {
      return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    }

    function listMeetings(archive = false, now = new Date()) {
      const today = meetingDay(now);
      return state.meetings.filter(m => Boolean(m.time && m.time.slice(0, 10) < today) === archive)
        .sort((a, b) => (archive ? -1 : 1) * String(a.time || "").localeCompare(String(b.time || "")) || String(a.id).localeCompare(String(b.id)));
    }

    function validMeeting(values) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(values.time || "");
      if (!match || !String(values.visitor || "").trim()) return false;
      const [, y, m, d, h, min] = match.map(Number);
      const date = new Date(0); date.setFullYear(y, m - 1, d); date.setHours(12, 0, 0, 0);
      return y > 0 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && h < 24 && min < 60;
    }

    function createMeeting(values) {
      if (!validMeeting(values)) return null;
      const meeting = { id: nextId("M", state.meetings), time: values.time, visitor: values.visitor.trim(), comment: values.comment || "", host: values.host || "", leadId: values.leadId || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.meetings.push(meeting); save(); return meeting;
    }

    function updateMeeting(id, values) {
      const meeting = state.meetings.find(m => m.id === id);
      if (!meeting) return null;
      const changes = {};
      ["time", "visitor", "comment", "host"].forEach(key => { if (values[key] !== undefined) changes[key] = values[key]; });
      if (!validMeeting({ ...meeting, ...changes })) return null;
      Object.assign(meeting, changes, { updatedAt: new Date().toISOString() });
      save(); return meeting;
    }

    function removeMeeting(id) {
      const index = state.meetings.findIndex(m => m.id === id);
      if (index < 0) return false;
      if(state.leads.some(l=>l.meetingId===id))throw Error("The meeting is linked to a lead and must be retained.");
      state.meetings.splice(index, 1); save(); return true;
    }

    function createLead(values) {
      const lead = {
        id: nextId("L", state.leads),
        name: values.name,
        expectedStart: values.expectedStart || "",
        comments: values.comments || "",
        status: "Aktivt",
        createdAt: new Date().toISOString().slice(0, 10),
        createdBy: "DE",
        updatedAt: new Date().toISOString()
      };
      state.leads.unshift(lead);
      save();
      return lead;
    }

    function updateLead(id, values) {
      const lead = state.leads.find(item => item.id === id);
      if (!lead || lead.status === "Konverterat") return null;
      Object.assign(lead, values, { updatedAt: new Date().toISOString() });
      save();
      return lead;
    }

    function removeLead(id) {
      const index = state.leads.findIndex(item => item.id === id);
      if (index < 0) return false;
      if(state.projects.some(p=>p.sourceLeadId===id))throw Error("The lead is linked to a project and must be retained.");
      state.leads.splice(index, 1);
      save();
      return true;
    }

    function createInquiry(values) {
      const inquiry = {
        id: nextId("I", state.inquiries),
        project: values.project,
        customer: values.customer,
        country: values.country,
        source: values.source,
        agent: values.agent || "—",
        value: Number(values.value) || 0,
        currency: values.currency || "EUR",
        probability: Number(values.probability) || 20,
        status: values.status || "Ny",
        received: values.received || new Date().toISOString().slice(0, 10),
        decision: values.decision || "",
        expectedStart: values.expectedStart || "",
        type: values.type || "Standard",
        area: Number(values.area) || 0,
        description: values.description || "",
        sourceLeadId: values.sourceLeadId || null,
        customerData: {
          name: values.customer || "",
          contact: values.contact || "",
          email: values.email || "",
          phone: values.phone || "",
          address: values.address || "",
          zip: values.zip || "",
          city: values.city || "",
          country: values.country || "",
          vatNumber: values.vatNumber || ""
        },
        preliminaryScope: [],
        designFiles: []
      };
      state.inquiries.unshift(inquiry);
      save();
      return inquiry;
    }

    function convertLead(id, inquiryId) {
      const lead = state.leads.find(item => item.id === id);
      if (!lead) return null;
      lead.status = "Konverterat";
      lead.inquiryId = inquiryId;
      lead.convertedAt = new Date().toISOString().slice(0, 10);
      lead.updatedAt = new Date().toISOString();
      save();
      return lead;
    }

    function convertInquiryToProject(id, values = {}) {
      const inquiry = state.inquiries.find(item => item.id === id);
      if (!inquiry) return null;
      inquiry.status = "Go";
      inquiry.probability = Number(values.probability ?? inquiry.probability) || 0;
      inquiry.decisionAt = new Date().toISOString().slice(0, 10);
      if (!Array.isArray(inquiry.history)) inquiry.history = [];
      inquiry.history.push({ status: "Go", date: inquiry.decisionAt });

      let project = state.projects.find(item => item.id === inquiry.projectId)
        || state.projects.find(item => item.sourceInquiryId === inquiry.id)
        || state.projects.find(item => item.name === inquiry.project && item.customer === inquiry.customer);
      const created = !project;
      if (!project) {
        project = {
          id: nextId("P", state.projects),
          sourceInquiryId: inquiry.id,
          name: inquiry.project,
          customer: inquiry.customer,
          country: inquiry.country,
          phase: "Kalkyl",
          businessStatus: "Aktivt",
          value: inquiry.value,
          currency: inquiry.currency,
          probability: inquiry.probability,
          owner: values.owner || "DE",
          agent: inquiry.agent !== "—" ? inquiry.agent : "",
          next: "Start costing",
          createdAt: new Date().toISOString().slice(0, 10),
          customerData: {
            sameAsBilling: true,
            billing: {
              name: inquiry.customerData?.name || inquiry.customer || "",
              address: inquiry.customerData?.address || "",
              zip: inquiry.customerData?.zip || "",
              city: inquiry.customerData?.city || "",
              country: inquiry.customerData?.country || inquiry.country || "",
              vatNumber: inquiry.customerData?.vatNumber || "",
              contact: inquiry.customerData?.contact || "",
              email: inquiry.customerData?.email || ""
            },
            delivery: {
              name: inquiry.customerData?.name || inquiry.customer || "",
              address: inquiry.customerData?.address || "",
              zip: inquiry.customerData?.zip || "",
              city: inquiry.customerData?.city || "",
              country: inquiry.customerData?.country || inquiry.country || "",
              contact: inquiry.customerData?.contact || "",
              phone: inquiry.customerData?.phone || ""
            }
          },
          preliminaryScope: clone(inquiry.preliminaryScope || []),
          designFiles: clone(inquiry.designFiles || [])
        };
        state.projects.unshift(project);
      } else {
        project.sourceInquiryId = project.sourceInquiryId || inquiry.id;
        if (!Array.isArray(project.preliminaryScope) || project.preliminaryScope.length === 0) project.preliminaryScope = clone(inquiry.preliminaryScope || []);
        if (!Array.isArray(project.designFiles) || project.designFiles.length === 0) project.designFiles = clone(inquiry.designFiles || []);
      }
      inquiry.projectId = project.id;
      save();
      return { project, created };
    }


return {adapter:'Supabase',getState:()=>state,save,meetingDay,listMeetings,createMeeting,updateMeeting,removeMeeting,createLead,updateLead,removeLead,createInquiry,convertLead,convertInquiryToProject};
}
window.CDPData={createRemoteStore};
})();
