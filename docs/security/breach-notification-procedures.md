# HIPAA Breach Notification Procedures

**Document ID:** SEC-BNP-001  
**Version:** 1.0  
**Effective Date:** February 7, 2026  
**Classification:** Internal Use Only  
**Compliance:** HIPAA Breach Notification Rule (45 CFR 164.404-408), HITECH Act

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Breach Definition](#2-breach-definition)
3. [Notification Timeline](#3-notification-timeline)
4. [Risk Assessment Procedures](#4-risk-assessment-procedures)
5. [Notification Requirements](#5-notification-requirements)
6. [Notification Templates](#6-notification-templates)
7. [Documentation Requirements](#7-documentation-requirements)
8. [Compliance Checklist](#8-compliance-checklist)

---

## 1. Purpose and Scope

### 1.1 Purpose

This document establishes procedures for assessing, documenting, and executing breach notifications required under the HIPAA Breach Notification Rule. These procedures ensure timely notification to affected individuals, the Department of Health and Human Services (HHS), and media when appropriate.

### 1.2 Scope

These procedures apply to:

- **Breaches of Unsecured PHI:** Any impermissible acquisition, access, use, or disclosure of PHI
- **Suspected Breaches:** Incidents requiring risk assessment to determine notification requirements
- **Large-Scale Incidents:** Affecting 500+ individuals (HHS and media notification required)
- **Small-Scale Incidents:** Affecting fewer than 500 individuals (annual HHS reporting)

### 1.3 Legal Requirements

**HIPAA Breach Notification Rule (45 CFR 164.404-408):**

| Requirement | Timeline | Recipient | Trigger |
|-------------|----------|-----------|---------|
| Individual Notification | 60 days | Affected individuals | Any breach of unsecured PHI |
| HHS Notification | 60 days | HHS OCR | Any breach of unsecured PHI |
| Media Notification | 60 days | Prominent media outlets | Breach affecting 500+ individuals in single state |
| Annual Reporting | March 1 annually | HHS OCR | All breaches <500 individuals in preceding year |

---

## 2. Breach Definition

### 2.1 What Constitutes a Breach

A breach is the **impermissible acquisition, access, use, or disclosure** of PHI that compromises the security or privacy of the PHI, unless there is a low probability that the PHI has been compromised based on a risk assessment.

### 2.2 Key Elements

| Element | Description |
|---------|-------------|
| **Impermissible** | Not authorized by HIPAA or the individual |
| **PHI** | Protected health information in any form |
| **Compromise** | Significant risk of harm from the disclosure |

### 2.3 Exceptions (No Breach Occurred)

A breach is NOT considered to have occurred if:

1. **Unauthorized Access with Low Probability of Compromise**
   - Workforce member reasonably believed PHI would not be retained
   - Unauthorized access by someone who did not view or copy PHI
   - Good faith, inadvertent access by authorized person
   - Unauthorized access but no viewing/copying occurred

2. **Encrypted PHI**
   - PHI encrypted using NIST-approved encryption
   - Encryption keys not compromised
   - PHI in encrypted form cannot be decrypted

3. **Controlled Destruction**
   - PHI deleted following document retention policies
   - No reasonable basis to believe PHI exists

### 2.4 Breach Determination Process

```
START: Incident Detected
  │
  ▼
Is PHI involved?
  │
  ├─ NO → No breach notification required (document reason)
  └─ YES → Continue
  │
  ▼
Was PHI acquired, accessed, used, or disclosed?
  │
  ├─ NO → No breach notification required (document reason)
  └─ YES → Continue
  │
  ▼
Does the PHI involve unsecured PHI?
  │
  ├─ YES → BREACH (proceed to risk assessment)
  └─ NO → No breach notification required (encrypted/redacted)
  │
  ▼
Conduct Risk Assessment:
  - Nature and extent of PHI involved
  - Unauthorized person who used/disclosed PHI
  - Whether PHI was actually viewed
  - Extent of mitigation efforts
  │
  ▼
Result:
  ├─ Low probability of compromise → No breach (document rationale)
  └─ High probability of compromise → BREACH (proceed to notification)
```

---

## 3. Notification Timeline

### 3.1 Critical Timeline (60 Hours)

| Phase | Timeframe | Actions |
|-------|-----------|---------|
| **Phase 1: Detection** | 0-4 hours | Incident detection, initial assessment, preserve evidence |
| **Phase 2: Assessment** | 4-12 hours | Risk assessment, breach determination, legal consultation |
| **Phase 3: Preparation** | 12-36 hours | Prepare notification letters, identify affected individuals |
| **Phase 4: Notification** | 36-60 hours | Send individual notifications, HHS notification |
| **Phase 5: Media (if applicable)** | 36-60 hours | Media notification for breaches >500 |

### 3.2 Internal Escalation Timeline

| Severity | Escalation | Time |
|----------|------------|------|
| **Critical** | CISO + Legal + Privacy Officer | Immediate |
| **High** | Privacy Officer | Within 1 hour |
| **Medium** | Security Lead | Within 4 hours |

### 3.3 Notification Deadline Calculator

```typescript
// Calculate notification deadline
function calculateNotificationDeadline(detectionDate: Date): Date {
  const deadline = new Date(detectionDate);
  deadline.setHours(deadline.getHours() + 60);
  return deadline;
}
```

---

## 4. Risk Assessment Procedures

### 4.1 Four-Factor Risk Assessment

Conduct a risk assessment using these four factors:

#### Factor 1: Nature and Extent of PHI

| PHI Type | Risk Level | Weight |
|----------|------------|--------|
| Mental health records | High | 1.0 |
| HIV/AIDS status | High | 1.0 |
| Substance abuse records | High | 1.0 |
| Genetic information | High | 1.0 |
| Medical record numbers | Medium | 0.8 |
| SSN | Medium | 0.8 |
| Date of birth | Medium | 0.7 |
| Email/phone/address | Low | 0.5 |
| Treatment information | Low | 0.5 |

#### Factor 2: Unauthorized Person

| Person Type | Risk Level | Weight |
|-------------|------------|--------|
| Unknown malicious actor | High | 1.0 |
| Known malicious actor | High | 1.0 |
| Former employee (disgruntled) | High | 1.0 |
| Unknown but no malice | Medium | 0.6 |
| Workforce member (inadvertent) | Low | 0.3 |
| Business associate | Medium | 0.7 |

#### Factor 3: PHI Viewed or Accessed

| Access Status | Risk Level | Weight |
|---------------|------------|--------|
| Confirmed viewing | High | 1.0 |
| Likely viewed | Medium-High | 0.8 |
| Unknown if viewed | Medium | 0.6 |
| Unlikely viewed | Low | 0.3 |
| Confirmed not viewed | None | 0 |

#### Factor 4: Extent of Mitigation

| Mitigation | Risk Reduction |
|------------|----------------|
| PHI returned/destroyed | Significant |
| Mitigation preventing use | Significant |
| PHI encrypted | Full |
| No mitigation possible | None |

### 4.2 Risk Assessment Scoring

**Calculate Risk Score:**

```
Risk Score = (PHI_Score × 0.4) + (Person_Score × 0.3) + (Access_Score × 0.2) + (Mitigation_Score × 0.1)
```

**Interpretation:**

| Score Range | Risk Level | Notification Required |
|-------------|------------|-----------------------|
| 0.0 - 0.3 | Low | May not require notification |
| 0.3 - 0.6 | Medium | Likely requires notification |
| 0.6 - 1.0 | High | Notification required |

### 4.3 Risk Assessment Documentation

```
RISK ASSESSMENT WORKSHEET

Incident ID: [Auto-assigned]
Assessment Date: [Date]
Assessor: [Name]

FACTOR 1: Nature and Extent of PHI
  PHI Types Involved: [List]
  PHI Risk Score: [0-1]
  Rationale: [Explanation]

FACTOR 2: Unauthorized Person
  Person Type: [Description]
  Person Risk Score: [0-1]
  Rationale: [Explanation]

FACTOR 3: PHI Access
  Access Status: [Confirmed/Likely/Unknown/Unlikely/Confirmed Not]
  Access Risk Score: [0-1]
  Rationale: [Explanation]

FACTOR 4: Mitigation
  Mitigation Actions: [List]
  Mitigation Effectiveness: [Description]
  Mitigation Score: [0-1]
  Rationale: [Explanation]

CALCULATED RISK SCORE: [0-1]
  
RECOMMENDATION:
□ Breach notification REQUIRED
□ Breach notification NOT REQUIRED (low probability of compromise)

RATIONALE:
[Detailed explanation of decision]

APPROVED BY:
Privacy Officer: [Signature/Date]
Legal Counsel: [Signature/Date]
```

---

## 5. Notification Requirements

### 5.1 Individual Notification

**Required Content:**

1. **Cover Sheet**
   - "PRIVATE AND CONFIDENTIAL"
   - "Notice of Privacy Breach"

2. **Letter Body**
   - Brief description of incident
   - Date of breach
   - Types of PHI involved
   - Steps taken to investigate
   - Actions taken to mitigate
   - Steps to protect against future breaches

3. **Required Information**
   - What happened
   - What information was involved
   - What you can do
   - What we are doing
   - Contact information for questions

4. **Sample Language**
   ```
   Dear [Individual Name],
   
   We are writing to inform you of a data security incident that may have 
   involved some of your personal information. This notice explains what 
   happened, what information was involved, and what we are doing about it.
   
   [Incident description]
   
   [What information was involved]
   
   [What you can do]
   
   [What we are doing]
   
   For more information, please contact [Contact Information].
   
   Sincerely,
   [Authorized Official]
   ```

### 5.2 HHS Notification

**Required Content:**

1. **Individual Notification Copy**
   - Copy of notification letter sent to individuals
   - Or template if individuals not yet notified

2. **Breach Summary**
   - Date of breach
   - Date of discovery
   - Types of PHI involved
   - Number of individuals affected
   - Number of records involved
   - Description of incident
   - Status of notification

3. **HHS Breach Notification Form**
   - Complete HHS OCR Breach Notification Form
   - Submit via HHS Portal

### 5.3 Media Notification

**Required When:**
- Breach affects 500+ individuals in a single state
- Media outlet serves that state

**Required Content:**
- Same content as individual notification
- Additional media contact information
- Press release format acceptable

### 5.4 Notification Methods

| Recipient | Method | Timing |
|-----------|--------|--------|
| Individual | Written notice (mail or email) | Within 60 days |
| HHS | Electronic submission | Within 60 days |
| Media | Press release | Within 60 days (if applicable) |

---

## 6. Notification Templates

### 6.1 Individual Notification Letter

```
[Organization Letterhead]

[Date]

[Individual Name]
[Address]

RE: Notice of Privacy Breach

Dear [Individual Name]:

We are writing to inform you of a security incident that may have involved 
some of your personal information. This notice explains what happened, 
what information was involved, and what we are doing about it.

WHAT HAPPENED
-------------
[Date] we discovered unauthorized access to our [system/database/application]. 
Our investigation determined that an unauthorized person may have accessed 
your information between [start date] and [end date].

WHAT INFORMATION WAS INVOLVED
------------------------------
The types of information that may have been involved include:
[□ Name]
[□ Address]
[□ Date of Birth]
[□ Social Security Number]
[□ Medical Record Number]
[□ Health Insurance Information]
[□ [Other specific PHI types]]

WHAT WE ARE DOING
-----------------
We have taken the following steps in response to this incident:
- Notified law enforcement authorities
- Implemented additional security measures
- Required additional workforce training
- Engaged a leading cybersecurity firm for assistance
- Reviewing and updating our security policies

WHAT YOU CAN DO
---------------
While we have no evidence that your information has been misused, we 
recommend you take the following protective measures:
- Monitor your financial accounts and health insurance statements
- Place a fraud alert on your credit reports
- Review the enclosed "Steps to Protect Yourself"
- Contact us if you notice any suspicious activity

FOR MORE INFORMATION
---------------------
We sincerely apologize for any inconvenience or concern this may cause. 
If you have questions, please contact:

[Contact Name]
[Phone Number]
[Email Address]
[Hours of Operation]

Sincerely,

[Authorized Official Name]
[Title]
[Organization]

Enclosure: Steps to Protect Your Information
```

### 6.2 HHS Notification Form

```
HHS BREACH NOTIFICATION FORM

SECTION 1: Covered Entity Information
  Entity Name: [Organization Name]
  HIPAA ID: [HIPAA Registration Number]
  Contact: [Name/Title]
  Phone: [Phone Number]
  Email: [Email Address]

SECTION 2: Breach Summary
  Date of Breach: [Date]
  Date of Discovery: [Date]
  Date of Notification: [Date]
  
SECTION 3: PHI Involved
  Types of PHI: [Check all that apply]
    □ Name
    □ SSN
    □ Date of Birth
    □ Address
    □ Medical Record Number
    □ Health Plan ID
    □ Account Number
    □ Certificate/License Number
    □ Vehicle Identifier
    □ Device Identifier
    □ URL/IP Address
    □ Biometric Identifier
    □ Photograph
    □ Other: [Specify]

SECTION 4: Impact Assessment
  Number of Individuals Affected: [Number]
  Number of Records Involved: [Number]
  
SECTION 5: Incident Description
  Description: [Detailed description of breach]
  Location of PHI: [Where PHI was stored]
  Cause of Breach: [Root cause if known]

SECTION 6: Mitigation
  Mitigation Actions: [Steps taken to address breach]
  Law Enforcement Notified: □ Yes □ No
  Law Enforcement Contact: [If yes]

SECTION 7: Notifications
  Individual Notification: □ In Progress □ Complete
  Media Notification: □ Required □ Not Required □ Complete
  HHS Notification: □ Complete
```

### 6.3 Media Notification Template

```
[Organization Letterhead]

FOR IMMEDIATE RELEASE

[Date]

Contact:
[Name]
[Title]
[Phone]
[Email]

[ORGANIZATION] Notifies Patients of Data Security Incident

[CITY, State] — [Organization] is notifying [Number] patients that 
their personal information may have been accessed without authorization 
following a data security incident.

On [Date], we discovered unauthorized access to our [system]. Our 
investigation determined that an unauthorized person may have accessed 
patient information between [start date] and [end date].

The information that may have been accessed includes:
[□ Name]
[□ Address]
[□ Date of Birth]
[□ Social Security Number]
[□ Medical Information]
[□ Health Insurance Information]

"We take the security of patient information very seriously," said 
[Official Name], [Title]. "We have implemented additional security 
measures to prevent this from happening again."

[Organization] is notifying affected individuals directly and has 
established a dedicated call center to answer questions. The notification 
letter includes information about steps individuals can take to protect 
their personal information.

For more information, please contact:
[Phone Number]
[Email]
[Website]

About [Organization]:
[Brief organizational description]

###
```

---

## 7. Documentation Requirements

### 7.1 Required Documentation

Maintain complete records of:

1. **Breach Risk Assessment**
   - All four-factor analysis
   - Scoring methodology
   - Final determination
   - Approver signatures

2. **Notification Records**
   - Copies of all notification letters
   - Proof of delivery (mail receipts, email confirmations)
   - Media release copies
   - HHS submission confirmations

3. **Incident Documentation**
   - Incident timeline
   - Investigation findings
   - Containment actions
   - Recovery steps

4. **Legal Documentation**
   - Legal counsel review
   - Regulatory notifications
   - Correspondence with HHS
   - Any enforcement actions

### 7.2 Documentation Retention

| Document Type | Retention Period |
|---------------|------------------|
| Breach Risk Assessments | 6 years |
| Notification Records | 6 years |
| Incident Documentation | 6 years |
| Legal Correspondence | 6 years |
| Annual Reports | 6 years |

### 7.3 Annual Reporting Requirements

**Due Date:** March 1 of each year

**Content:**
- Number of breaches affecting fewer than 500 individuals
- Aggregated information about all breaches
- Breakout by type of breach
- Mitigation actions taken

---

## 8. Compliance Checklist

### 8.1 Immediate Response (0-4 hours)

```
□ Incident detected and confirmed
□ Incident Commander notified
□ Evidence preserved
□ Initial containment actions taken
□ Risk assessment initiated
□ Legal counsel consulted
□ Privacy Officer engaged
```

### 8.2 Risk Assessment (4-12 hours)

```
□ Complete four-factor risk assessment
□ Document PHI types involved
□ Document unauthorized persons
□ Document PHI access status
□ Document mitigation actions
□ Calculate risk score
□ Obtain approvals
□ Determine breach status
```

### 8.3 Notification Preparation (12-36 hours)

```
□ Identify all affected individuals
□ Prepare individual notification letters
□ Prepare HHS notification
□ Prepare media notification (if applicable)
□ Legal review of notification letters
□ Final approval from CISO/Legal
□ Arrange notification delivery
```

### 8.4 Notification Execution (36-60 hours)

```
□ Send individual notifications
□ Confirm delivery
□ Submit HHS notification
□ Submit media notification (if applicable)
□ Document all notifications
□ Update affected individuals on progress
```

### 8.5 Post-Notification (After 60 hours)

```
□ Confirm all notifications received
□ Monitor for issues
□ Complete post-incident review
□ Update security procedures
□ Conduct training if needed
□ Document lessons learned
□ Prepare annual report (if required)
```

---

## Appendix A: Breach Severity Quick Reference

| PHI Type | Severity | Notification Priority | Risk Score |
|----------|----------|----------------------|------------|
| Mental Health | Critical | Immediate | 1.0 |
| HIV/AIDS | Critical | Immediate | 1.0 |
| Substance Abuse | Critical | Immediate | 1.0 |
| Genetic Info | Critical | Immediate | 1.0 |
| SSN | High | 24 hours | 0.8 |
| Medical Record | High | 24 hours | 0.8 |
| Health Plan ID | High | 24 hours | 0.8 |
| Insurance Info | Medium | 48 hours | 0.6 |
| DOB | Medium | 48 hours | 0.6 |
| Contact Info | Low | 72 hours | 0.4 |

## Appendix B: Contact Directory

| Contact | Purpose | Phone | Email |
|---------|---------|-------|-------|
| HHS OCR | Breach Notification | 1-800-368-1019 | [HHS Portal] |
| State AG | State notification varies | [State-specific] | [State-specific] |
| Privacy Officer | Internal inquiries | [Internal] | privacy@healthcare-ai.local |
| Legal Counsel | Legal questions | [Internal] | legal@healthcare-ai.local |
| CISO | Security inquiries | [Internal] | ciso@healthcare-ai.local |

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 7, 2026 | Privacy Officer | Initial release |

**Review Schedule:** Annually  
**Next Review:** February 2027  
**Owner:** Privacy Officer
